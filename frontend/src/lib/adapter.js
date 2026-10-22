// One switch decides where data comes from. Components never import the mock or
// live adapter directly, so swapping in real data touches nothing else.
import * as mock from './mockAdapter.js'
import * as live from './liveAdapter.js'

export const isMock = import.meta.env.VITE_USE_MOCK !== 'false'
export const streamJourney = isMock ? mock.streamJourney : live.streamJourney
export const expandNode = isMock ? mock.expandNode : live.expandNode
