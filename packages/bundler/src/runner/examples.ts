import { ethers, BigNumberish, BigNumber, Contract } from "ethers";
import { JsonRpcProvider, TransactionRequest } from "@ethersproject/providers";
import {
  SimpleAccountAPI,
  PaymasterAPI,
  HttpRpcClient,
} from "@account-abstraction/sdk";
import {
  DeterministicDeployer,
  IEntryPoint,
  IEntryPointSimulations,
  PackedUserOperation,
  SimpleAccountFactory__factory,
  fillSignAndPack,
  packUserOp,
} from "aa-conla-utils";
import {
  parseEther,
  hexZeroPad,
  hexDataSlice,
  formatEther,
} from "ethers/lib/utils";
import {
  EntryPoint__factory,
  EntryPointSimulations__factory,
} from "aa-conla-sdk";
import EntryPointSimulationsJson from "@account-abstraction/contracts/artifacts/EntryPointSimulations.json";
import { IEntryPoint__factory, SimpleAccount__factory } from "../types";

// const MNEMONIC = 'test test test test test test test test test test test junk'
const MNEMONIC =
  "skate eight behind action easy maximum rigid cycle surround solar warm world";
const entryPointAddress = "0x3bFc49341Aae93e30F6e2BE5a7Fa371cEbd5bea4";
const rpcUrl = "https://rpc.testnet.conla.com";
const bundlerUrl = "https://aa-bundler.conla.com/rpc";
const provider = new JsonRpcProvider(rpcUrl);
const token = "0x5aA74b97C775539256e0C08875c4F6B2109af19E"; // Address of the ERC-20 token
const beneficiary = "0xEE35dA6bA29cc1A60d0d9042fa8c88CbEA6d12c0";
const paymaster = "0x26E68f18CE130B8d4A0A6f5A2e628e89d0b51FC6";
const bundlerBackendUrl = "http://localhost:3030";

export interface ValidationData {
  aggregator: string;
  validAfter: number;
  validUntil: number;
}

async function main() {
  const paymasterAPI = new PaymasterAPI(bundlerBackendUrl);
  const owner0 = ethers.Wallet.fromMnemonic(
    MNEMONIC,
    "m/44'/60'/0'/0/0"
  ).connect(provider);
  const owner = ethers.Wallet.fromMnemonic(
    MNEMONIC,
    "m/44'/60'/0'/0/3"
  ).connect(provider);

  // console.log("wallet", owner.address)
  // await owner0.sendTransaction({ to: owner.address, value: parseEther('15') })

  const entryPoint = IEntryPoint__factory.connect(entryPointAddress, owner);
  // console.log('before', await provider.getBalance(entryPoint.address))
  // console.log('signer', formatEther(await owner.getBalance()))
  // console.log('signer', owner.getAddress())
  // await owner.sendTransaction({ to: beneficiary, value: parseEther('2') })

  // await entryPoint.depositTo(paymaster, { value: parseEther('2') })
  // await entryPoint.depositTo(beneficiary, { value: parseEther('2') })
  // console.log("paymaster balance before", formatEther(await entryPoint.balanceOf(paymaster)))
  // const paymasterBalanceBefore = await entryPoint.balanceOf(paymaster)
  // console.log("beneficiary balance before", formatEther(await provid  er.getBalance(beneficiary)))

  const detDeployer = new DeterministicDeployer(provider);
  const factoryAddress = await detDeployer.deterministicDeploy(
    new SimpleAccountFactory__factory(),
    0,
    [entryPointAddress]
  );
  const accountFactory = new SimpleAccountFactory__factory(owner).attach(
    factoryAddress
  );
  // await (await accountFactory).createAccount(owner.address, 0)

  // const accountFactory = _factory ?? await new SimpleAccountFactory__factory(ethersSigner).deploy(entryPoint)
  // const implementation = await accountFactory.accountImplementation()
  // await accountFactory.createAccount(accountOwner, 0)
  // const accountAddress = await accountFactory.getAddress(accountOwner, 0)
  // const proxy = SimpleAccount__factory.connect(accountAddress, ethersSigner)
  // return {
  //   implementation,
  //   accountFactory,
  //   proxy
  // }

  // await sendErc20(owner, factoryAddress, paymasterAPI)
  await sendNative(owner, (await accountFactory).address, paymasterAPI);

  console.log(
    "paymaster balance after",
    formatEther(await entryPoint.balanceOf(paymaster))
  );
  console.log(
    "beneficiary balance after",
    formatEther(await provider.getBalance(beneficiary))
  );
  console.log(
    "default owner balance after",
    formatEther(
      await provider.getBalance("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266")
    )
  );
}

async function sendNative(
  owner: ethers.Wallet,
  factoryAddress: string,
  paymasterAPI: PaymasterAPI
) {
  console.log("--- START SENDING NATIVE TOKEN ---");
  const dest = ethers.Wallet.createRandom();

  const accountAPI = new SimpleAccountAPI({
    provider: provider,
    entryPointAddress: entryPointAddress,
    owner: owner,
    factoryAddress: factoryAddress,
    paymasterAPI: paymasterAPI,
    bundlerUrl: bundlerBackendUrl,
  });

  const gasPrice = await provider.getGasPrice();
  const value = parseEther("0.1");

  const op = await accountAPI.createSignedUserOp({
    target: "0xeF2167037aC297fa711FD3bB228543D58c82AFd6",
    data: "0x",
    value: value,
    maxFeePerGas: gasPrice,
    maxPriorityFeePerGas: gasPrice,
  });

  // const packeUserOp = await packUserOp(op)
  // console.log("packeUserOp",packeUserOp)
  const tx = await accountAPI.sendHandlerOps([op]);
  console.log("tx hash: ", tx);
  console.log("--- COMPLETE SENDING NATIVE TOKEN ---");
}

// async function sendErc20(owner: ethers.Wallet, factoryAddress: string, paymasterAPI: PaymasterAPI) {
//   const value = '1230' // Amount of the ERC-20 token to transfer

//   const erc20 = new ethers.Contract(token, erc20ABI, provider)
//   const amount = ethers.utils.parseUnits(value)
//   const dest = ethers.Wallet.createRandom()

//   const approve = erc20.interface.encodeFunctionData('approve', [dest.address, amount])
//   const transfer = erc20.interface.encodeFunctionData('transfer', [dest.address, amount])

//   const accountAPI = new SimpleAccountAPI({
//     provider,
//     entryPointAddress,
//     owner,
//     factoryAddress,
//     paymasterAPI
//   })

//   const signer = await provider.getSigner()

//   const accountContract = await accountAPI._getAccountContract()
//   console.log('--- START SENDING ERC20 TOKEN ---')
//   await signer.sendTransaction({ to: accountContract.address, value: parseEther('0.1') })

//   console.log('onwer balance before', await owner.getBalance())
//   console.log('account contract balance before', await provider.getBalance(accountContract.address))
//   console.log('owner erc20 balance before', await erc20.balanceOf(owner.address))
//   console.log('dest erc20 balance before', await erc20.balanceOf(dest.address))

//   const op = await accountAPI.createSignedUserOp({
//     target: token,
//     data: transfer,
//     value: 0
//   })

//   const chainId = await provider.getNetwork().then(net => net.chainId)
//   const client = new HttpRpcClient(bundlerUrl, entryPointAddress, chainId)
//   const userOpHash = await client.sendUserOpToBundler(op)

//   console.log('Waiting for transaction...')
//   const transactionHash = await accountAPI.getUserOpReceipt(userOpHash)
//   console.log(`Transaction hash: ${transactionHash}`)

//   console.log('onwer balance after', await owner.getBalance())
//   console.log('account contract balance after', await provider.getBalance(accountContract.address))
//   console.log('onwer erc20 balance after', await erc20.balanceOf(owner.address))
//   console.log('dest erc20 balance after', await erc20.balanceOf(dest.address))

//   console.log('--- COMPLETE SENDING ERC20 TOKEN ---')
// }

void main()
  .catch((e) => {
    console.log(e);
    process.exit(1);
  })
  .then(() => process.exit(0));

export async function simulateValidation(
  userOp: PackedUserOperation,
  entryPointAddress: string,
  txOverrides?: any
): Promise<IEntryPointSimulations.ValidationResultStructOutput> {
  const entryPointSimulations =
    EntryPointSimulations__factory.createInterface();
  const data = entryPointSimulations.encodeFunctionData("simulateValidation", [
    userOp,
  ]);
  const tx: TransactionRequest = {
    to: entryPointAddress,
    data,
    ...txOverrides,
  };
  const stateOverride = {
    [entryPointAddress]: {
      code: EntryPointSimulationsJson.deployedBytecode,
    },
  };
  try {
    const simulationResult = await provider.send("eth_call", [
      tx,
      "latest",
      stateOverride,
    ]);
    const res = entryPointSimulations.decodeFunctionResult(
      "simulateValidation",
      simulationResult
    );
    // note: here collapsing the returned "tuple of one" into a single value - will break for returning actual tuples
    return res[0];
  } catch (error: any) {
    const revertData = error?.data;
    if (revertData != null) {
      // note: this line throws the revert reason instead of returning it
      entryPointSimulations.decodeFunctionResult(
        "simulateValidation",
        revertData
      );
    }
    throw error;
  }
}

export const maxUint48 = 2 ** 48 - 1;

export function parseValidationData(
  validationData: BigNumberish
): ValidationData {
  const data = hexZeroPad(BigNumber.from(validationData).toHexString(), 32);

  // string offsets start from left (msb)
  const aggregator = hexDataSlice(data, 32 - 20);
  let validUntil = parseInt(hexDataSlice(data, 32 - 26, 32 - 20));
  if (validUntil === 0) {
    validUntil = maxUint48;
  }
  const validAfter = parseInt(hexDataSlice(data, 0, 6));

  return {
    aggregator,
    validAfter,
    validUntil,
  };
}
