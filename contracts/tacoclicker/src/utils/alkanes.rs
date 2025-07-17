use crate::{schemas::SchemaAlkaneId, utils::encoders::bytes_to_u128_words, Tortilla};
use alkanes_runtime::runtime::AlkaneResponder;
use alkanes_support::id::AlkaneId;
use alkanes_support::{cellpack::Cellpack, response::CallResponse};
use anyhow::{anyhow, Context, Result};
use borsh::BorshSerialize;

impl Tortilla {
    pub fn clone_at_target<P>(
        &self,
        response: &mut CallResponse,
        target: AlkaneId,
        payload: &P,
    ) -> Result<SchemaAlkaneId>
    where
        P: BorshSerialize,
    {
        // 1. derive the “next” alkane ID from the sequence counter
        let seq = self.sequence();
        let next_alkane = SchemaAlkaneId {
            block: 2,
            tx: seq
                .try_into()
                .map_err(|_| anyhow!("TORTILLA: sequence {} overflows u32", seq))?,
        };

        // 2. serialise the user payload → u128 words
        let payload_bytes =
            borsh::to_vec(payload).context("TORTILLA: failed to Borsh‑serialise payload")?;

        let mut calldata: Vec<u128> = vec![0u128]; // selector / dummy word
        calldata.extend_from_slice(&bytes_to_u128_words(&payload_bytes));

        let clone_target = AlkaneId {
            block: 5u128,
            tx: target.tx.into(),
        };
        let cellpack = Cellpack {
            target: clone_target,
            inputs: calldata,
        };

        self.call(&cellpack, &mut response.alkanes, self.fuel())
            .map_err(|e| {
                anyhow!(
                    "TORTILLA: failed to clone alkane @ {},{} → {e}",
                    clone_target.block,
                    clone_target.tx
                )
            })?;

        Ok(next_alkane)
    }

    pub fn controlled_mint_contract_mint_new(
        &self,
        response: &CallResponse,
        target: AlkaneId,
        amount: u128,
    ) -> Result<()> {
        let cellpack = Cellpack {
            target: target,
            inputs: vec![106u128, amount],
        };

        self.call(&cellpack, &response.alkanes, self.fuel())
            .map_err(|e| {
                anyhow!(
                    "TORTILLA: failed to mint alkane @ {},{} → {e}",
                    target.block,
                    target.tx
                )
            })?;

        Ok(())
    }
}
