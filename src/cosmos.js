// Builds unsigned Cosmos transactions for chain `pocket`. Two shapes are returned
// so any Cosmos wallet can sign: an Amino StdSignDoc (keplr.signAmino / Leap) and
// EncodeObject messages + fee (CosmJS SigningStargateClient with the wallet's signer).
import { config } from './config.js';

export function fee(gas) {
  const amount = Math.ceil(gas * config.pocketGasPrice);
  return { amount: [{ denom: config.pocketDenom, amount: String(amount) }], gas: String(gas) };
}

function wrap({ messages, amino, gas, acct, memo }) {
  const f = fee(gas);
  return {
    chain_id: config.pocketChainId,
    messages,
    fee: f,
    memo,
    amino_sign_doc: {
      chain_id: config.pocketChainId,
      account_number: acct.account_number,
      sequence: acct.sequence,
      fee: f,
      msgs: amino,
      memo,
    },
  };
}

export function delegateTx({ delegator, validator, units, acct, memo = '' }) {
  const amount = { denom: config.pocketDenom, amount: units };
  return wrap({
    gas: 250_000, acct, memo,
    messages: [{ typeUrl: '/cosmos.staking.v1beta1.MsgDelegate', value: { delegatorAddress: delegator, validatorAddress: validator, amount } }],
    amino: [{ type: 'cosmos-sdk/MsgDelegate', value: { delegator_address: delegator, validator_address: validator, amount } }],
  });
}

export function sendTx({ from, to, units, acct, memo = '' }) {
  const amount = [{ denom: config.pocketDenom, amount: units }];
  return wrap({
    gas: 100_000, acct, memo,
    messages: [{ typeUrl: '/cosmos.bank.v1beta1.MsgSend', value: { fromAddress: from, toAddress: to, amount } }],
    amino: [{ type: 'cosmos-sdk/MsgSend', value: { from_address: from, to_address: to, amount } }],
  });
}
