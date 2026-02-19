export type WalletProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<any>;
  on?: (event: string, cb: (...args: any[]) => void) => void;
  removeListener?: (event: string, cb: (...args: any[]) => void) => void;
};

export type OnchainCall = {
  to: `0x${string}`;
  value?: `0x${string}`;
  data?: `0x${string}`;
};

export type SubmitConfig = {
  chainIdHex: `0x${string}`;
  from: `0x${string}`;
  calls: OnchainCall[];
  dataSuffixHex?: `0x${string}`;
};

export async function enforceChain(provider: WalletProvider, chainIdHex: `0x${string}`) {
  await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chainIdHex }] });
}

export async function submitOnchain(provider: WalletProvider, config: SubmitConfig): Promise<{ accepted: boolean; txHash?: string }> {
  const baseCall = {
    version: "2.0.0",
    chainId: config.chainIdHex,
    from: config.from,
    atomicRequired: false,
    calls: config.calls
  };

  try {
    let result: any;
    if (config.dataSuffixHex) {
      try {
        result = await provider.request({
          method: "wallet_sendCalls",
          params: [
            {
              ...baseCall,
              capabilities: {
                dataSuffix: {
                  value: config.dataSuffixHex,
                  optional: true
                }
              }
            }
          ]
        });
      } catch {
        result = await provider.request({
          method: "wallet_sendCalls",
          params: [
            {
              ...baseCall,
              capabilities: {
                dataSuffix: config.dataSuffixHex
              }
            }
          ]
        });
      }
    } else {
      result = await provider.request({ method: "wallet_sendCalls", params: [baseCall] });
    }

    if (typeof result === "string") return { accepted: true };
    if (result?.transactionHash) return { accepted: true, txHash: result.transactionHash };
    if (result) return { accepted: true };
  } catch {
    // fallback to simple transaction
  }

  const txHash = (await provider.request({
    method: "eth_sendTransaction",
    params: [
      {
        from: config.from,
        to: config.calls[0]?.to,
        value: config.calls[0]?.value,
        data: config.calls[0]?.data
      }
    ]
  })) as string;

  return { accepted: true, txHash };
}

export function normalizeAddress(address: string): `0x${string}` {
  return address.trim().toLowerCase() as `0x${string}`;
}
