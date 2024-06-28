import { BigNumber, BigNumberish, ContractTransaction, ethers } from "ethers";
import {
  IEntryPoint,
  IEntryPoint__factory,
  PackedUserOperationStruct,
  SimpleAccount,
  SimpleAccount__factory,
  SimpleAccountFactory,
  SimpleAccountFactory__factory,
  UserOperation,
} from "aa-conla-utils";

import { arrayify } from "ethers/lib/utils";
import { Signer } from "@ethersproject/abstract-signer";
import { BaseApiParams, BaseAccountAPI, FactoryParams } from "./BaseAccountAPI";

/**
 * constructor params, added no top of base params:
 * @param owner the signer object for the account owner
 * @param factoryAddress address of contract "factory" to deploy new contracts (not needed if account already deployed)
 * @param index nonce value used when creating multiple accounts for the same owner
 */
export interface SimpleAccountApiParams extends BaseApiParams {
  owner: Signer;
  factoryAddress?: string;
  index?: BigNumberish;
  bundlerUrl?: string;
}

/**
 * An implementation of the BaseAccountAPI using the SimpleAccount contract.
 * - contract deployer gets "entrypoint", "owner" addresses and "index" nonce
 * - owner signs requests using normal "Ethereum Signed Message" (ether's signer.signMessage())
 * - nonce method is "nonce()"
 * - execute method is "execFromEntryPoint()"
 */
export class SimpleAccountAPI extends BaseAccountAPI {
  factoryAddress?: string;
  owner: Signer;
  index: BigNumberish;
  entrypointAddress: string;

  /**
   * our account contract.
   * should support the "execFromEntryPoint" and "nonce" methods
   */
  accountContract?: SimpleAccount;
  factory?: SimpleAccountFactory;
  beneficiaryAddress: string;
  bundlerUrl: string | undefined;
  constructor(params: SimpleAccountApiParams) {
    super(params);
    this.factoryAddress = params.factoryAddress;
    this.owner = params.owner;
    this.index = BigNumber.from(params.index ?? 0);
    this.beneficiaryAddress = ethers.constants.AddressZero;
    this.beneficiaryAddress = "0xEE35dA6bA29cc1A60d0d9042fa8c88CbEA6d12c0";
    this.entrypointAddress = params.entryPointAddress;
    this.bundlerUrl = params.bundlerUrl;
  }

  async _getAccountContract(): Promise<SimpleAccount> {
    if (this.accountContract == null) {
      this.accountContract = SimpleAccount__factory.connect(
        await this.getAccountAddress(),
        this.provider
      );
    }
    return this.accountContract;
  }

  /**
   * return the value to put into the "initCode" field, if the account is not yet deployed.
   * this value holds the "factory" address, followed by this account's information
   */
  async getFactoryData(): Promise<FactoryParams | null> {
    if (this.factory == null) {
      if (this.factoryAddress != null && this.factoryAddress !== "") {
        this.factory = SimpleAccountFactory__factory.connect(
          this.factoryAddress,
          this.provider
        );
      } else {
        throw new Error("no factory to get initCode");
      }
    }
    return {
      factory: this.factory.address,
      factoryData: this.factory.interface.encodeFunctionData("createAccount", [
        await this.owner.getAddress(),
        this.index,
      ]),
    };
  }

  async getNonce(): Promise<BigNumber> {
    if (await this.checkAccountPhantom()) {
      return BigNumber.from(0);
    }
    const accountContract = await this._getAccountContract();
    return await accountContract.getNonce();
  }

  /**
   * encode a method call from entryPoint to our contract
   * @param target
   * @param value
   * @param data
   */
  async encodeExecute(
    target: string,
    value: BigNumberish,
    data: string
  ): Promise<string> {
    const accountContract = await this._getAccountContract();
    return accountContract.interface.encodeFunctionData("execute", [
      target,
      value,
      data,
    ]);
  }

  async signUserOpHash(userOpHash: string): Promise<string> {
    return await this.owner.signMessage(arrayify(userOpHash));
  }

  async sendHandlerOps(ops: UserOperation[]): Promise<string> {
    const convertUserOperation = (op: UserOperation) => {
      return {
        sender: op.sender,
        nonce: Number(op.nonce),
        initCode: op.initCode,
        callData: op.callData,
        callGasLimit: Number(op.callGasLimit),
        verificationGasLimit: Number(op.verificationGasLimit),
        maxFeePerGas: Number(op.maxFeePerGas),
        maxPriorityFeePerGas: Number(op.maxPriorityFeePerGas),
        paymasterAndData: op.paymasterData,
        preVerificationGas: Number(op.preVerificationGas),
        signature: op.signature,
        paymasterVerificationGasLimit: Number(op.paymasterVerificationGasLimit),
        paymasterPostOpGasLimit: Number(op.paymasterPostOpGasLimit),
        paymaster: op.paymaster,
        entryPoint: this.entrypointAddress,
      };
    };

    const params = ops.map(convertUserOperation);

    const response = await fetch(this.bundlerUrl + "/api/v1/bundler/userop", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        data: params,
      }),
    });
    if (!response.ok) {
      throw new Error("Network response was not ok " + response.statusText);
    }
    const responseData = await response.json();
    return responseData.data;
  }
}
