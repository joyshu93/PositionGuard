import type { StrategyInputs, StrategySettings } from "../domain/types.js";

export const DEFAULT_STRATEGY_SETTINGS: StrategySettings = {
  minimumTradeValueKrw: 5_000,
  entryAllocation: 0.25,
  addAllocation: 0.15,
  reduceFraction: 0.33,
  perAssetMaxAllocation: 0.45,
  totalPortfolioMaxExposure: 0.75,
};

export function buildDefaultStrategyInputs(): StrategyInputs {
  return {
    portfolio: {
      totalEquity: 0,
      assetMarketValue: 0,
      totalExposureValue: 0,
      assetExposureRatio: 0,
      totalExposureRatio: 0,
    },
    latestDecision: null,
    recentExit: {
      createdAt: null,
      hoursSinceExit: null,
      realizedPnl: null,
    },
    settings: DEFAULT_STRATEGY_SETTINGS,
  };
}
