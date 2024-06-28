// misc utilities for the various modules.

import { BytesLike, ContractFactory, BigNumber } from "ethers";
import { hexlify, hexZeroPad, Result, arrayify } from "ethers/lib/utils";
import { Provider, JsonRpcProvider } from "@ethersproject/providers";
import { BigNumberish } from "ethers/lib/ethers";
import {
  encodeUserOp,
  NotPromise,
  packUserOp,
  UserOperation,
} from "./ERC4337Utils";
import { PackedUserOperationStruct, SimpleAccount__factory } from "./soltypes";

export interface SlotMap {
  [slot: string]: string;
}

/**
 * map of storage
 * for each address, either a root hash, or a map of slot:value
 */
export interface StorageMap {
  [address: string]: string | SlotMap;
}

export interface StakeInfo {
  addr: string;
  stake: BigNumberish;
  unstakeDelaySec: BigNumberish;
}

export interface TransactionDetailsForUserOp {
  target: string;
  data: string;
  value?: BigNumberish;
  gasLimit?: BigNumberish;
  maxFeePerGas?: BigNumberish;
  maxPriorityFeePerGas?: BigNumberish;
  nonce?: BigNumberish;
}

export type PackedUserOperation = NotPromise<PackedUserOperationStruct>;

export enum ValidationErrors {
  InvalidFields = -32602,
  SimulateValidation = -32500,
  SimulatePaymasterValidation = -32501,
  OpcodeValidation = -32502,
  NotInTimeRange = -32503,
  Reputation = -32504,
  InsufficientStake = -32505,
  UnsupportedSignatureAggregator = -32506,
  InvalidSignature = -32507,
  UserOperationReverted = -32521,
}

export interface ReferencedCodeHashes {
  // addresses accessed during this user operation
  addresses: string[];

  // keccak over the code of all referenced addresses
  hash: string;
}

export class RpcError extends Error {
  // error codes from: https://eips.ethereum.org/EIPS/eip-1474
  constructor(
    msg: string,
    readonly code?: number,
    readonly data: any = undefined
  ) {
    super(msg);
  }
}

export function tostr(s: BigNumberish): string {
  return BigNumber.from(s).toString();
}

export function requireCond(
  cond: boolean,
  msg: string,
  code?: number,
  data: any = undefined
): void {
  if (!cond) {
    throw new RpcError(msg, code, data);
  }
}

// verify that either address field exist along with "mustFields",
// or address field is missing, and none of the must (or optional) field also exists
export function requireAddressAndFields(
  userOp: UserOperation,
  addrField: string,
  mustFields: string[],
  optionalFields: string[] = []
): void {
  const op = userOp as any;
  const addr = op[addrField];
  if (addr == null) {
    const unexpected = Object.entries(op).filter(
      ([name, value]) =>
        value != null &&
        (mustFields.includes(name) || optionalFields.includes(name))
    );
    requireCond(
      unexpected.length === 0,
      `no ${addrField} but got ${unexpected.join(",")}`,
      ValidationErrors.InvalidFields
    );
  } else {
    requireCond(
      addr.match(/^0x[a-f0-9]{10,40}$/i),
      `invalid ${addrField}`,
      ValidationErrors.InvalidFields
    );
    const missing = mustFields.filter((name) => op[name] == null);
    requireCond(
      missing.length === 0,
      `got ${addrField} but missing ${missing.join(",")}`,
      ValidationErrors.InvalidFields
    );
  }
}

/**
 * create a dictionary object with given keys
 * @param keys the property names of the returned object
 * @param mapper mapper from key to property value
 * @param filter if exists, must return true to add keys
 */
export function mapOf<T>(
  keys: Iterable<string>,
  mapper: (key: string) => T,
  filter?: (key: string) => boolean
): {
  [key: string]: T;
} {
  const ret: { [key: string]: T } = {};
  for (const key of keys) {
    if (filter == null || filter(key)) {
      ret[key] = mapper(key);
    }
  }
  return ret;
}

export async function sleep(sleepTime: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, sleepTime));
}

export async function waitFor<T>(
  func: () => T | undefined,
  timeout = 10000,
  interval = 500
): Promise<T> {
  const endTime = Date.now() + timeout;
  while (true) {
    const ret = await func();
    if (ret != null) {
      return ret;
    }
    if (Date.now() > endTime) {
      throw new Error(`Timed out waiting for ${func as unknown as string}`);
    }
    await sleep(interval);
  }
}

export async function supportsRpcMethod(
  provider: JsonRpcProvider,
  method: string,
  params: any[]
): Promise<boolean> {
  const ret = await provider.send(method, params).catch((e) => e);
  const code = ret.error?.code ?? ret.code;
  return code === -32602; // wrong params (meaning, method exists)
}

// extract address from initCode or paymasterAndData
export function getAddr(data?: BytesLike): string | undefined {
  if (data == null) {
    return undefined;
  }
  const str = hexlify(data);
  if (str.length >= 42) {
    return str.slice(0, 42);
  }
  return undefined;
}

/**
 * merge all validationStorageMap objects into merged map
 * - entry with "root" (string) is always preferred over entry with slot-map
 * - merge slot entries
 * NOTE: slot values are supposed to be the value before the transaction started.
 *  so same address/slot in different validations should carry the same value
 * @param mergedStorageMap
 * @param validationStorageMap
 */
export function mergeStorageMap(
  mergedStorageMap: StorageMap,
  validationStorageMap: StorageMap
): StorageMap {
  Object.entries(validationStorageMap).forEach(([addr, validationEntry]) => {
    if (typeof validationEntry === "string") {
      // it's a root. override specific slots, if any
      mergedStorageMap[addr] = validationEntry;
    } else if (typeof mergedStorageMap[addr] === "string") {
      // merged address already contains a root. ignore specific slot values
    } else {
      let slots: SlotMap;
      if (mergedStorageMap[addr] == null) {
        slots = mergedStorageMap[addr] = {};
      } else {
        slots = mergedStorageMap[addr] as SlotMap;
      }

      Object.entries(validationEntry).forEach(([slot, val]) => {
        slots[slot] = val;
      });
    }
  });
  return mergedStorageMap;
}

export function toBytes32(b: BytesLike | number): string {
  return hexZeroPad(hexlify(b).toLowerCase(), 32);
}

/**
 * run the constructor of the given type as a script: it is expected to revert with the script's return values.
 * @param provider provider to use fo rthe call
 * @param c - contract factory of the script class
 * @param ctrParams constructor parameters
 * @return an array of arguments of the error
 * example usasge:
 *     hashes = await runContractScript(provider, new GetUserOpHashes__factory(), [entryPoint.address, userOps]).then(ret => ret.userOpHashes)
 */
export async function runContractScript<T extends ContractFactory>(
  provider: Provider,
  c: T,
  ctrParams: Parameters<T["getDeployTransaction"]>
): Promise<Result> {
  const tx = c.getDeployTransaction(...ctrParams);
  const ret = await provider.call(tx);
  const parsed = ContractFactory.getInterface(c.interface).parseError(ret);
  if (parsed == null) {
    throw new Error("unable to parse script (error) response: " + ret);
  }
  return parsed.args;
}

function parseNumber(a: any): BigNumber | null {
  if (a == null || a === "") return null;
  return BigNumber.from(a.toString());
}

export interface GasOverheads {
  /**
   * fixed overhead for entire handleOp bundle.
   */
  fixed: number;

  /**
   * per userOp overhead, added on top of the above fixed per-bundle.
   */
  perUserOp: number;

  /**
   * overhead for userOp word (32 bytes) block
   */
  perUserOpWord: number;

  // perCallDataWord: number

  /**
   * zero byte cost, for calldata gas cost calculations
   */
  zeroByte: number;

  /**
   * non-zero byte cost, for calldata gas cost calculations
   */
  nonZeroByte: number;

  /**
   * expected bundle size, to split per-bundle overhead between all ops.
   */
  bundleSize: number;

  /**
   * expected length of the userOp signature.
   */
  sigSize: number;
}

export const DefaultGasOverheads: GasOverheads = {
  fixed: 21000,
  perUserOp: 18300,
  perUserOpWord: 4,
  zeroByte: 4,
  nonZeroByte: 16,
  bundleSize: 1,
  sigSize: 65,
};

export function calcPreVerificationGas(
  userOp: Partial<UserOperation>,
  overheads?: Partial<GasOverheads>
): number {
  const ov = { ...DefaultGasOverheads, ...(overheads ?? {}) };
  const p: UserOperation = {
    // dummy values, in case the UserOp is incomplete.
    preVerificationGas: 21000, // dummy value, just for calldata cost
    signature: hexlify(Buffer.alloc(ov.sigSize, 1)), // dummy signature
    ...userOp,
  } as any;

  const packed = arrayify(encodeUserOp(packUserOp(p), false));
  const lengthInWord = (packed.length + 31) / 32;
  const callDataCost = packed
    .map((x) => (x === 0 ? ov.zeroByte : ov.nonZeroByte))
    .reduce((sum, x) => sum + x);
  const ret = Math.round(
    callDataCost +
      ov.fixed / ov.bundleSize +
      ov.perUserOp +
      ov.perUserOpWord * lengthInWord
  );
  return ret;
}

export async function packUserOpDapp(
  detailsForUserOp: TransactionDetailsForUserOp,
  provider: JsonRpcProvider,
  accounAddress: string, // account contract address
  entryPointAddress: string
): Promise<Partial<UserOperation>> {
  const { data, target } = detailsForUserOp;

  console.log("come to pack user", detailsForUserOp);
  const value = parseNumber(detailsForUserOp.value) ?? BigNumber.from(0);

  console.log("value", value);
  const accountContract = SimpleAccount__factory.connect(
    accounAddress,
    provider
  );

  console.log("account contract address", accountContract);

  const callData = accountContract.interface.encodeFunctionData("execute", [
    target,
    value,
    data,
  ]);

  console.log("call data", callData);

  const callGasLimit = 200000;
  // parseNumber(detailsForUserOp.gasLimit) ??
  // (await provider.estimateGas({
  //   from: entryPointAddress,
  //   to: accounAddress,
  //   data: callData
  // }))

  console.log("gas limit", callGasLimit);

  const nonce = await accountContract.getNonce();
  console.log("nonce ", nonce);
  const gasPrice = await provider.getGasPrice();
  console.log("gasPrice ", gasPrice);

  const partialUserOp = {
    maxFeePerGas: gasPrice,
    maxPriorityFeePerGas: gasPrice,
    verificationGasLimit: 10e6,
    sender: accounAddress,
    callData,
    callGasLimit,
    nonce,
  };
  const preVerificationGas = calcPreVerificationGas(partialUserOp);

  return {
    ...partialUserOp,
    preVerificationGas,
  };
}
