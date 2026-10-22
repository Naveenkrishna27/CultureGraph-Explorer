/**
 * THE DATA CONTRACT between the UI and whatever feeds it (mock data now, the
 * FastAPI backend later). The UI only understands these shapes.
 *
 * @typedef {Object} GraphNode
 * @property {string} id            Stable unique id (use the Qloo entity id when real).
 * @property {string} name
 * @property {string} category      One of the keys in CATEGORIES below.
 * @property {'seed'|'found'} role  'seed' = what the user started with.
 * @property {number} depth         Hops from the seed.
 * @property {string} [blurb]       One short neutral description.
 * @property {string} [qlooId]
 *
 * @typedef {Object} GraphEdge
 * @property {string} id
 * @property {string} source        Node id.
 * @property {string} target        Node id.
 * @property {'direct'|'inferred'} kind
 *   'direct'   = Qloo returned the target when asked about the source.
 *   'inferred' = the agent proposes it; NO single Qloo response links the two.
 * @property {boolean} crossCategory  True when source and target categories differ.
 * @property {number} [score]       Relative score from the Qloo response, if any.
 * @property {{endpoint:string, params:Record<string,string>, retrievedAt:string, mock?:boolean}} [retrieved]
 *   Provenance for 'direct' edges: what was called and when.
 * @property {string} [interpretation]  Model-written reading of the link. NOT evidence.
 * @property {'template'|'model'} [interpretedBy]  Who wrote `interpretation`: the app's template or a language model.
 * @property {string[]} [sharedTags]  Tags Qloo gives to BOTH ends. Evidence, straight from Qloo results.
 * @property {string[]} [targetTags]  Tags Qloo uses to describe the entity that was returned.
 *
 * @typedef {Object} Step
 * @property {string} id
 * @property {'resolve'|'query'|'choose'|'verify'|'evaluate'|'stop'|'note'} type
 * @property {string} title
 * @property {string} [detail]
 * @property {string} [tool]        e.g. 'qloo.insights', 'agent.rank'
 * @property {number} [calls]       Running total of Qloo calls used so far.
 *
 * Streaming events (one JSON object per line from the backend, or yielded by the mock):
 *   {type:'step', step: Step}
 *   {type:'node', node: GraphNode}
 *   {type:'edge', edge: GraphEdge}
 *   {type:'budget', used:number, max:number}
 *   {type:'done', path?: string[], summary?: string}   path = node ids of the discovery route
 *   {type:'status', message: string}   a short "what I am doing now" line for the map
 *   {type:'choices', query: string, options: {id,name,category,blurb}[]}   the name matched several things
 *   {type:'error', message: string}
 */

export const CATEGORIES = {
  movie: { label: 'Film', color: '#FF5A47' },
  artist: { label: 'Music artist', color: '#1D3F8A' },
  book: { label: 'Book', color: '#16804F' },
  tv_show: { label: 'TV show', color: '#F29A00' },
  brand: { label: 'Brand', color: '#B5359A' },
  place: { label: 'Place', color: '#0F8F86' },
  video_game: { label: 'Video game', color: '#D63384' },
  podcast: { label: 'Podcast', color: '#4B3FA0' },
  person: { label: 'Person', color: '#9A5B1F' },
  destination: { label: 'Travel destination', color: '#D9552B' },
  other: { label: 'Other', color: '#4F6D7A' },
}

// Accepts 'movie', 'urn:entity:movie', or either spelling of video game.
export const normalizeCategory = (key = '') => {
  const k = String(key).replace('urn:entity:', '')
  return k === 'videogame' ? 'video_game' : k
}

export const categoryOf = (key) => CATEGORIES[normalizeCategory(key)] || CATEGORIES.other

export const MODES = [
  { id: 'explore', label: 'Explore', hint: 'See what Qloo links to your starting point, then choose where to go next.' },
  { id: 'serendipity', label: 'Serendipity', hint: 'Skip the obvious. The agent favours links that cross into other categories.' },
  { id: 'rabbit_hole', label: 'Rabbit hole', hint: 'The agent wanders on a small query budget, picks branches, and stops when it finds something surprising.' },
]
