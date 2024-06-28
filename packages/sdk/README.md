# SDK to create and send UserOperation 

This package provides 2 APIs for using UserOperations:

- Low-level "walletAPI"
- High-level Provider


## LowLevel API:

### BaseWalletAPI

An abstract base-class to create UserOperation for a contract wallet.

### SimpleAccountAPI

An implementation of the BaseWalletAPI, for the SimpleWallet sample of account-abstraction.

```typescript
import { ethers, BigNumberish, BigNumber, Contract } from 'ethers'
import { JsonRpcProvider, TransactionRequest } from '@ethersproject/providers'
import { SimpleAccountAPI, PaymasterAPI, HttpRpcClient } from 'aa-conla-sdk'
import {
  DeterministicDeployer,
  IEntryPoint, PackedUserOperation,
  SimpleAccountFactory__factory,
  fillSignAndPack,
  packUserOp
} from 'aa-conla-utils'
import { parseEther, hexZeroPad, hexDataSlice, formatEther } from 'ethers/lib/utils'
import { EntryPoint__factory } from 'aa-conla-utils/dist/src/types'
import { IEntryPoint__factory } from '../types'

const MNEMONIC = 'your mnemonic key'
const entryPointAddress = '0x3bFc49341Aae93e30F6e2BE5a7Fa371cEbd5bea4'
const rpcUrl = 'https://rpc.testnet.conla.com'
const bundlerUrl = 'https://aa-bundler.conla.com/rpc'
const provider = new JsonRpcProvider(rpcUrl)
const token = '0x5aA74b97C775539256e0C08875c4F6B2109af19E' // Address of the ERC-20 token
const beneficiary = "0xEE35dA6bA29cc1A60d0d9042fa8c88CbEA6d12c0"
const paymaster = "0x26E68f18CE130B8d4A0A6f5A2e628e89d0b51FC6"
const bundlerBackendUrl = "http://localhost:3030"

export interface ValidationData {
  aggregator: string
  validAfter: number
  validUntil: number
}

async function main () {
  const paymasterAPI = new PaymasterAPI(bundlerBackendUrl)
  const owner0 = ethers.Wallet.fromMnemonic(MNEMONIC, "m/44'/60'/0'/0/0").connect(provider)
  const owner = ethers.Wallet.fromMnemonic(MNEMONIC, "m/44'/60'/0'/0/3").connect(provider)
  const entryPoint = IEntryPoint__factory.connect(entryPointAddress, owner)

  const accountFactory = new SimpleAccountFactory__factory(owner).attach(factoryAddress)
  const detDeployer = new DeterministicDeployer(provider)
  const factoryAddress = await detDeployer.deterministicDeploy(new SimpleAccountFactory__factory(), 0, [entryPointAddress])

  await sendNative(owner, (await accountFactory).address, paymasterAPI)
}

async function sendNative( owner: ethers.Wallet, factoryAddress: string, paymasterAPI: PaymasterAPI) {
  console.log('--- START SENDING NATIVE TOKEN ---')
  const dest = ethers.Wallet.createRandom()

  const accountAPI = new SimpleAccountAPI({
    provider: provider,
    entryPointAddress: entryPointAddress,
    owner: owner,
    factoryAddress: factoryAddress,
    paymasterAPI: paymasterAPI,
    bundlerUrl: bundlerBackendUrl,
  })

  const gasPrice = await provider.getGasPrice()
  const value = parseEther('0.1')

  const op = await accountAPI.createSignedUserOp({
    target: "0xeF2167037aC297fa711FD3bB228543D58c82AFd6",
    data: "0x",
    value: value,
    maxFeePerGas: gasPrice,
    maxPriorityFeePerGas: gasPrice,
  })

  const tx = await accountAPI.sendHandlerOps([op])
  console.log("tx hash: ", tx)
  console.log('--- COMPLETE SENDING NATIVE TOKEN ---')
}



void main()
  .catch(e => { console.log(e); process.exit(1) })
  .then(() => process.exit(0))
```

## High-Level Provider API

A simplified mode that doesn't require a different wallet extension. 
Instead, the current provider's account is used as wallet owner by calling its "Sign Message" operation.

This can only work for wallets that use an EIP-191 ("Ethereum Signed Message") signature (like our sample SimpleWallet)
Also, the UX is not great (the user is asked to sign a hash, and even the wallet address is not mentioned, only the signer)

```typescript
import { wrapProvider } from 'aa-conla-sdk'

//use this account as wallet-owner (which will be used to sign the requests)
const aaSigner = provider.getSigner()
const paymasterAPI = new PaymasterAPI(entryPointAddress, bundlerUrl)

const config = {
  chainId: await provider.getNetwork().then(net => net.chainId),
  entryPointAddress,
  bundlerUrl: 'bundlerUrl',
  paymasterAPI
} 
const aaProvider = await wrapProvider(provider, config, aaSigner)
const walletAddress = await aaProvider.getSigner().getAddress()

// send some eth to the wallet Address: wallet should have some balance to pay for its own creation, and for calling methods.

const myContract = new Contract(abi, aaProvider)

// this method will get called from the wallet address, through account-abstraction EntryPoint
await myContract.someMethod()
```

