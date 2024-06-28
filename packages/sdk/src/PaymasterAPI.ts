import {
  callDataCost,
  encodeUserOp,
  fillUserOp,
  fillUserOpDefaults,
  UserOperation,
} from "aa-conla-utils";
import { ethers, BigNumberish, BytesLike } from "ethers";
import { calcPreVerificationGas } from "./calcPreVerificationGas";
import { defaultAbiCoder, hexConcat } from "ethers/lib/utils";

/**
 * returned paymaster parameters.
 * note that if a paymaster is specified, then the gasLimits must be specified
 * (even if postOp is not called, the paymasterPostOpGasLimit must be set to zero)
 */
export interface PaymasterParams {
  paymaster: string;
  paymasterData?: BytesLike;
  paymasterVerificationGasLimit: BigNumberish;
  paymasterPostOpGasLimit: BigNumberish;
}

const MOCK_VALID_UNTIL = "0x00000000deadbeef";
const MOCK_VALID_AFTER = "0x0000000000001234";

async function OptoJSON(op: Partial<UserOperation>): Promise<any> {
  const userOp = await ethers.utils.resolveProperties(op);
  return Object.keys(userOp)
    .map((key) => {
      let val = (userOp as any)[key];
      if (typeof val !== "string" || !val.startsWith("0x")) {
        val = ethers.utils.hexValue(val);
      }
      return [key, val];
    })
    .reduce(
      (set, [k, v]) => ({
        ...set,
        [k]: v,
      }),
      {}
    );
}

/**
 * an API to external a UserOperation with paymaster info
 */
export class PaymasterAPI {
  private readonly paymasterUrl: string;

  constructor(paymasterUrl: string) {
    this.paymasterUrl = paymasterUrl;
  }

  /**
   * return temporary values to put into the paymaster fields.
   * @param userOp the partially-filled UserOperation. Should be filled with tepmorary values for all
   *    fields except paymaster fields.
   * @return temporary paymaster parameters, that can be used for gas estimations
   */
  async getTemporaryPaymasterData(
    userOp: Partial<UserOperation>
  ): Promise<PaymasterParams | null> {
    return null;
  }

  /**
   * after gas estimation, return final paymaster parameters to replace the above tepmorary value.
   * @param userOp a partially-filled UserOperation (without signature and paymasterAndData
   *  note that the "preVerificationGas" is incomplete: it can't account for the
   *  paymasterAndData value, which will only be returned by this method..
   * @returns the values to put into paymaster fields, null to leave them empty
   */
  async getPaymasterData(
    userOp: Partial<UserOperation>
  ): Promise<PaymasterParams | null> {
    const op = fillUserOpDefaults(userOp);
    const params = {
      sender: op.sender,
      nonce: Number(op.nonce),
      initCode: op.initCode,
      callData: op.callData,
      callGasLimit: Number(op.callGasLimit),
      verificationGasLimit: Number(op.verificationGasLimit),
      maxFeePerGas: Number(op.maxFeePerGas),
      maxPriorityFeePerGas: Number(op.maxPriorityFeePerGas),
      signature: op.signature.toString(),
    };

    const response = await fetch(
      this.paymasterUrl + "/api/v1/bundler/paymaster",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(params),
      }
    );
    if (!response.ok) {
      throw new Error("Network response was not ok " + response.statusText);
    }
    const responseData = await response.json();
    return responseData.data;
  }

  async deployPaymaster(): Promise<string> {
    return "1";
  }
}
