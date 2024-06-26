import timers from 'node:timers/promises'

/**
 * @param {object} args
 * @param {import('ethers').Contract[]} args.contracts
 * @param {string} args.ethAddress
 * @param {(m: Partial<import('./metrics.js').MetricsEvent>) => void} args.onMetrics
 */
export const runUpdateRewardsLoop = async ({ contracts, ethAddress, onMetrics }) => {
  while (true) {
    while (!contracts.length) {
      await timers.setTimeout(1000)
    }
    const contractRewards = await Promise.all(contracts.map(async contract => {
      return getScheduledRewardsWithFallback(contract, ethAddress)
    }))
    const totalRewards = contractRewards.reduce((a, b) => a + b, 0n)
    onMetrics({ rewardsScheduledForAddress: totalRewards })

    const delay = 10 * 60 * 1000 // 10 minutes
    const jitter = Math.random() * 20_000 - 10_000 // +- 10 seconds
    await timers.setTimeout(delay + jitter)
  }
}

async function getScheduledRewardsWithFallback (contract, ethAddress) {
  try {
    return await contract.rewardsScheduledFor(ethAddress)
  } catch (err) {
    console.error('Failed to get scheduled rewards:', err.stack)
    return 0n
  }
}
