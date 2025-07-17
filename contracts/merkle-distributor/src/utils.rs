use crate::MerkleDistributor;
use alkanes_runtime::runtime::AlkaneResponder;
use alkanes_support::context::Context;
use alkanes_support::witness::find_witness_payload;
use anyhow::{anyhow, Result};
use bitcoin::Transaction;
use ordinals::{Artifact, Runestone};
use protorune_support::{protostone::Protostone, utils::consensus_decode};
use sha2::{Digest, Sha256};
use std::io::Cursor;
pub fn u128_to_string(v: u128) -> String {
    String::from_utf8(
        v.to_le_bytes()
            .into_iter()
            .fold(Vec::<u8>::new(), |mut r, v| {
                if v != 0 {
                    r.push(v)
                }
                r
            }),
    )
    .unwrap()
}

//Does not consume inputs so context retains control
pub fn get_byte_array_from_inputs(inputs: &[u128]) -> Vec<u8> {
    // skip(1) leaves the original Vec untouched and avoids an O(n) remove
    inputs
        .iter()
        .skip(1)
        .flat_map(|num| num.to_le_bytes()) // still LE
        .collect()
}

pub fn extract_witness_payload(tx: &Transaction) -> Option<Vec<u8>> {
    // Try every input; Ordinals conventionally uses index 0, but
    // looping covers edge‑cases.
    for idx in 0..tx.input.len() {
        if let Some(data) = find_witness_payload(&tx, idx) {
            if !data.is_empty() {
                return Some(data);
            }
        }
    }
    None
}

pub fn calc_merkle_root(leaf: &[u8], proofs: &[Vec<u8>]) -> [u8; 32] {
    let mut node: Vec<u8> = leaf.to_vec();

    for sib in proofs {
        let (left, right) = if node <= *sib {
            (&node, sib)
        } else {
            (sib, &node)
        };
        let mut hasher = Sha256::new();
        hasher.update(left);
        hasher.update(right);
        node = hasher.finalize().to_vec();
    }

    // convert Vec<u8> → [u8;32]
    let mut root = [0u8; 32];
    root.copy_from_slice(&node);
    root
}

impl MerkleDistributor {
    pub fn validate_protostone_tx(&self, ctx: &Context) -> Result<()> {
        let tx = consensus_decode::<Transaction>(&mut Cursor::new(self.transaction()))
            .map_err(|_| anyhow!("failed to decode transaction bytes"))?;

        let runestone = match Runestone::decipher(&tx) {
            Some(Artifact::Runestone(r)) => r,
            _ => return Err(anyhow!("transaction does not contain a runestone")),
        };

        let protostones = Protostone::from_runestone(&runestone)
            .map_err(|e| anyhow!("failed to parse protostone: {e}"))?;

        let pm_index =
            ctx.vout
                .checked_sub(tx.output.len() as u32 + 1)
                .ok_or_else(|| anyhow!("vout is not a protomessage index"))? as usize;

        let message = protostones
            .get(pm_index)
            .ok_or_else(|| anyhow!("no protostone message at computed index"))?;

        if !message.edicts.is_empty() {
            return Err(anyhow!("protostone message must have zero edicts"));
        }

        let pointer = message
            .pointer
            .ok_or_else(|| anyhow!("protostone message has no pointer"))?;

        if pointer as usize >= tx.output.len() {
            return Err(anyhow!(
                "pointer index {pointer} points outside real user outputs"
            ));
        }

        if pointer != 0 {
            return Err(anyhow!("pointer must be set to 0! found {pointer}"));
        }

        Ok(())
    }
}
macro_rules! decode_from_ctx {
    ($ctx:expr, $ty:ty) => {{
        use std::io::Cursor;
        let mut rdr = Cursor::new(get_byte_array_from_inputs(&$ctx.inputs));
        <$ty>::deserialize_reader(&mut rdr).map_err(|_| {
            ::anyhow::anyhow!("MERKLE DISTRIBUTOR: failed to decode {}", stringify!($ty))
        })
    }};
}
macro_rules! decode_from_vec {
    ($bytes:expr, $ty:ty) => {{
        use std::io::Cursor;
        // Accept anything that turns into a byte slice; `&Vec<u8>` or `&[u8]` both work.
        let mut rdr = Cursor::new(&$bytes[..]);
        <$ty>::deserialize_reader(&mut rdr).map_err(|_| {
            ::anyhow::anyhow!("MERKLE DISTRIBUTOR: failed to decode {}", stringify!($ty))
        })
    }};
}
// Allow other modules in the same crate to `use` it:
pub(crate) use {decode_from_ctx, decode_from_vec};
