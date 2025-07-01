# Tortilla


## building

```
cargo build --target wasm32-unknown-unknown --release
```


# Contracts


### tortilla
The tortilla contract is the main alkanes token and contract for taco clicker. It is a fungible token that introduces the following opcodes
(78n) -> `register` - If initialized, checks if `FUNDING_PRICE_SATS` is sent to `FUNDING ADDRESS`, and if so, clones the taqueria factory contract @ [2,n] and
    transfers the taqueria AlkaneId to the caller. Because the taqeuria contract can only be initialized byy the tortilla contract, the payment of `FUNDING_PRICE_SATS` is enforced from the get go.

(79n) -> `get_is_valid_registration (alkane_id: AlkaneID)`- The user is incharge of having knowledge of which alkaneid in their balance corresponds to a factory. This
method allows the user to do so, they can query every alkaneid in their balance and check if its a valid registered taqueria factory. The reason we dont have a 
map of `address -> alkaneid` for taquerias within the contract is because Alkanes is UTXO based and lives in "utxo land".
Meaning: we cannot derive a singular party from a transaction (what if the tx is multisig? what if its a psbt? what if its a taproot tree?) and we dont have
knowledge of the transaction history of a given alkaneid (within the contract environment). Taquerias therefore have to be stateless, even if it means an
expensive initial query for the user to determine what taquerias they hold

(example: multisigs), so the taqueria auth alkane is the only way to authenticate a taqueria is valid.

(80n) ->  `getTaqueriaFactory()` - This method allows the user to get the taqueria factory AlkaneId.

(81n) -> `getSalsa()` - This method allows the user to get the salsa AlkaneId.

(82n) -> `getFundingPriceSats()` - This method allows the user to get the funding price in sats for registering a taqueria factory.

(83n) -> `getFundingAddress()` - This method allows the user to get the funding address for registering a taqueria factory.

### taqueria-contract
The taqueria factory contract is a contract that can only be initialized by the tortilla contract. Someone registers through the tacoclicker contract and
receive a taqueria AlkaneId. This taqueria AlkaneId has a supply of 1. Authentication is done by including the utxo with the TAQUERIA AUTH alkane inside the
transaction. The user must ensure to send this alkane back to themselves, or they will lose access to upgrades held by the taqueria contract.

Taquerias can have many upgrades, which the user buys with Tortilla. Taquerias have context of the Tortilla AlkaneId because the factory is deployed after
the tortilla contract.



## Deployment flow
--- Deploy the tortilla contract
|
|
--- Deploy the taqueria factory contract with the Tortilla AlkaneId
|
|
---- Deploy the salsa contract with the Tortilla AlkaneId
|
|
---- Initialize the tortilla contract with the taqueria factory AlkaneId and the salsa AlkaneId


### storage context

```
/registration/<caller's vec<u8>>
=> u8 (0x01 || 0x00)
```
