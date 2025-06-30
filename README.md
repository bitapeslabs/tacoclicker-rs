# Tortilla


## building

```
cargo build --target wasm32-unknown-unknown --release
```


### storage context

```
/registration/<caller's vec<u8>>
=> u8 (0x01 || 0x00)
```
