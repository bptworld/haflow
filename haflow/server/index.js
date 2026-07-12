import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import WebSocket, { WebSocketServer } from 'ws'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = process.env.HAFLOW_DATA_DIR || path.join(__dirname, '..', 'data')
const distDir = path.join(__dirname, '..', 'dist')
const configPath = path.join(dataDir, 'config.json')
const legacyFlowPath = path.join(dataDir, 'flow-default.json')
const flowsDir = path.join(dataDir, 'flows')
const flowIndexPath = path.join(flowsDir, 'index.json')
const logPath = path.join(dataDir, 'logs.json')
const runtimePath = path.join(dataDir, 'node-runtime.json')
const runHistoryPath = path.join(dataDir, 'run-history.json')
const examplesDir = path.join(__dirname, '..', 'examples')
const app = express()
const port = Number(process.env.PORT ?? 4177)
const supervisorToken = process.env.SUPERVISOR_TOKEN || ''

let config = { runnerEnabled: false }
let logs = []
let clients = new Set()
let haSocket = null
let haMessageId = 1
let reconnectTimer = null
let lastTimeKey = ''
let activeScheduleWindows = new Set()
let haConfigCache = null
let runningTriggers = new Map()
let manualRun = null
let nodeRuntime = new Map()
let runHistory = []
let activeRunEvents = new Map()
let cachedFlow = { nodes: [], edges: [] }
let cachedFlowMeta = { id: 'default', name: 'Default Flow', paused: false }
let runnableFlowCache = null
let waiters = []
let notificationActionWaiters = []
let deviceRegistryById = new Map()
let entityRegistryDeviceByEntityId = new Map()
const ANY_CHANGE = '__changed__'
const LUTRON_5_BUTTON_PICO_BUTTONS = [1, 2, 5, 3, 4]
const SCHEDULE_TIME_TYPES = new Set(['time', 'sunrise', 'sunset'])

app.use(express.json({ limit: '10mb' }))

await fs.mkdir(dataDir, { recursive: true })
await fs.mkdir(flowsDir, { recursive: true })
config = { ...config, ...(await readJson(configPath, config)), runnerEnabled: true }
await writeJson(configPath, config)
logs = await readJson(logPath, [])
nodeRuntime = new Map(Object.entries(await readJson(runtimePath, {})))
runHistory = normalizeRunHistory(await readJson(runHistoryPath, []))
await initializeFlowLibrary()
cachedFlow = await readFlow(config.activeFlowId ?? 'default')
cachedFlowMeta = await readFlowMeta(config.activeFlowId ?? 'default')

app.get('/api/config', async (_, res) => {
  const status = await getStatus()
  res.json(status)
})

app.get('/api/entities', async (_, res) => {
  try {
    const entities = await haRest('/api/states')
    res.json({ entities })
  } catch (error) {
    res.json({ entities: [], error: error.message })
  }
})

app.get('/api/entity-catalog', async (_, res) => {
  try {
    const [states, areas, devices, registryEntities] = await Promise.all([
      haRest('/api/states'),
      haWsCommand('config/area_registry/list'),
      haWsCommand('config/device_registry/list'),
      haWsCommand('config/entity_registry/list'),
    ])

    const areaById = new Map(areas.map((area) => [area.area_id, area]))
    const deviceById = new Map(devices.map((device) => [device.id, device]))
    deviceRegistryById = deviceById
    const registryByEntityId = new Map(registryEntities.map((entity) => [entity.entity_id, entity]))
    entityRegistryDeviceByEntityId = new Map(registryEntities
      .filter((entity) => entity.entity_id && entity.device_id)
      .map((entity) => [entity.entity_id, entity.device_id]))
    const stateEntityIds = new Set(states.map((state) => state.entity_id))
    const devicesWithStateEntities = new Set(registryEntities
      .filter((entity) => entity.device_id && stateEntityIds.has(entity.entity_id))
      .map((entity) => entity.device_id))
    const deviceOnlyEntries = devices
      .filter((device) => !devicesWithStateEntities.has(device.id))
      .map((device) => enrichDevice(device, areaById))

    const entities = states.map((state) => enrichEntity(state, registryByEntityId, deviceById, areaById))
      .concat(deviceOnlyEntries)
      .sort(compareCatalogEntities)

    res.json({ entities })
  } catch (error) {
    try {
      const entities = await haRest('/api/states')
      res.json({ entities: entities.map((entity) => enrichEntity(entity)).sort(compareCatalogEntities), error: error.message })
    } catch (fallbackError) {
      res.json({ entities: [], error: fallbackError.message })
    }
  }
})

app.get('/api/entity-values/:entityId', async (req, res) => {
  const entityId = req.params.entityId
  if (!entityId || !entityId.includes('.')) return res.status(400).json({ values: [], error: 'Invalid entity id.' })

  try {
    const state = await haRest(`/api/states/${entityId}`)
    const values = await getEntityObservedValues(entityId, state)
    res.json({ values })
  } catch (error) {
    res.json({ values: [], error: error.message })
  }
})

app.get('/api/services', async (_, res) => {
  try {
    const serviceList = await haRest('/api/services')
    const services = Object.fromEntries(serviceList.map((domain) => [domain.domain, domain.services]))
    res.json({ services })
  } catch (error) {
    res.json({ services: {}, error: error.message })
  }
})

app.get('/api/flows', async (_, res) => {
  const flows = await readFlowIndex()
  res.json({ flows, activeFlowId: config.activeFlowId ?? 'default' })
})

app.post('/api/flows', async (req, res) => {
  const sourceFlow = req.body.sourceFlowId ? await readFlow(req.body.sourceFlowId) : { nodes: [], edges: [] }
  const sourceMeta = req.body.sourceFlowId ? (await readFlowIndex()).find((item) => item.id === req.body.sourceFlowId) : null
  const flows = await readFlowIndex()
  const name = ensureUniqueFlowName(req.body.name || 'New Flow', flows)
  const flow = {
    id: slugifyFlowId(name),
    name,
    createdAt: new Date().toISOString(),
    paused: Boolean(sourceMeta?.paused),
  }
  flow.id = ensureUniqueFlowId(flow.id, flows)
  await writeJson(getFlowPath(flow.id), sourceFlow)
  await writeFlowIndex([...flows, flow])
  log('info', `Created flow ${flow.name}.`)
  res.json({ flow, flows: await readFlowIndex() })
})

app.patch('/api/flows/:flowId/pause', async (req, res) => {
  const flowId = safeFlowId(req.params.flowId)
  if (!flowId) return res.status(400).json({ error: 'Invalid flow id.' })
  const flows = await readFlowIndex()
  const flow = flows.find((item) => item.id === flowId)
  if (!flow) return res.status(404).json({ error: 'Flow not found.' })
  const paused = Boolean(req.body.paused)
  await writeFlowIndex(flows.map((item) => item.id === flowId ? { ...item, paused } : item))
  if ((config.activeFlowId ?? 'default') === flowId) cachedFlowMeta = { ...flow, paused }
  if (paused && (config.activeFlowId ?? 'default') === flowId) {
    manualRun?.controller.abort()
    for (const run of runningTriggers.values()) run.controller.abort()
  }
  log(paused ? 'warn' : 'info', `${flow.name} ${paused ? 'paused' : 'resumed'}.`)
  broadcastRunner()
  res.json({ flows: await readFlowIndex(), activeFlowId: config.activeFlowId ?? 'default' })
})

app.patch('/api/flows/:flowId', async (req, res) => {
  const flowId = safeFlowId(req.params.flowId)
  if (!flowId) return res.status(400).json({ error: 'Invalid flow id.' })
  const flows = await readFlowIndex()
  const flow = flows.find((item) => item.id === flowId)
  if (!flow) return res.status(404).json({ error: 'Flow not found.' })
  const name = ensureUniqueFlowName(req.body.name || flow.name, flows, flowId)
  const nextFlow = { ...flow, name }
  await writeFlowIndex(flows.map((item) => item.id === flowId ? nextFlow : item))
  if ((config.activeFlowId ?? 'default') === flowId) cachedFlowMeta = nextFlow
  invalidateRunnableFlowCache()
  log('info', `Renamed flow to ${name}.`)
  broadcastRunner()
  res.json({ flow: nextFlow, flows: await readFlowIndex(), activeFlowId: config.activeFlowId ?? 'default' })
})

app.get('/api/flows/default', async (_, res) => {
  config = { ...config, activeFlowId: 'default' }
  await writeJson(configPath, config)
  cachedFlow = await readFlow('default')
  cachedFlowMeta = await readFlowMeta('default')
  invalidateRunnableFlowCache()
  res.json(cachedFlow)
})

app.put('/api/flows/default', async (req, res) => {
  cachedFlow = { nodes: req.body.nodes ?? [], edges: req.body.edges ?? [], viewport: normalizeViewport(req.body.viewport) }
  config = { ...config, activeFlowId: 'default' }
  await writeJson(configPath, config)
  await writeFlow('default', cachedFlow)
  log('info', 'Flow saved.')
  broadcastRunner()
  res.json({ ok: true, message: 'Flow saved.' })
})

app.get('/api/flows/:flowId', async (req, res) => {
  const flowId = safeFlowId(req.params.flowId)
  if (!flowId) return res.status(400).json({ error: 'Invalid flow id.' })
  config = { ...config, activeFlowId: flowId }
  await writeJson(configPath, config)
  cachedFlow = await readFlow(flowId)
  cachedFlowMeta = await readFlowMeta(flowId)
  invalidateRunnableFlowCache()
  broadcastRunner()
  res.json(cachedFlow)
})

app.put('/api/flows/:flowId', async (req, res) => {
  const flowId = safeFlowId(req.params.flowId)
  if (!flowId) return res.status(400).json({ error: 'Invalid flow id.' })
  cachedFlow = { nodes: req.body.nodes ?? [], edges: req.body.edges ?? [], viewport: normalizeViewport(req.body.viewport) }
  config = { ...config, activeFlowId: flowId }
  await writeJson(configPath, config)
  await writeFlow(flowId, cachedFlow)
  log('info', 'Flow saved.')
  broadcastRunner()
  res.json({ ok: true, message: 'Flow saved.' })
})

app.delete('/api/flows/:flowId', async (req, res) => {
  const flowId = safeFlowId(req.params.flowId)
  if (!flowId || flowId === 'default') return res.status(400).json({ error: 'Default flow cannot be deleted.' })
  const flows = await readFlowIndex()
  const nextFlows = flows.filter((flow) => flow.id !== flowId)
  if (nextFlows.length === flows.length) return res.status(404).json({ error: 'Flow not found.' })
  await fs.rm(getFlowPath(flowId), { force: true })
  await writeFlowIndex(nextFlows)
  if (config.activeFlowId === flowId) {
    config = { ...config, activeFlowId: 'default' }
    cachedFlow = await readFlow('default')
    cachedFlowMeta = await readFlowMeta('default')
    await writeJson(configPath, config)
  }
  log('warn', `Deleted flow ${flowId}.`)
  broadcastRunner()
  res.json({ flows: await readFlowIndex(), activeFlowId: config.activeFlowId ?? 'default' })
})

app.get('/api/backup', async (_, res) => {
  const flows = await readFlowIndex()
  const backupFlows = await Promise.all(flows.map(async (meta) => ({
    meta,
    flow: await readFlow(meta.id),
  })))
  res.json({
    app: 'HAFlow',
    version: 1,
    exportedAt: new Date().toISOString(),
    activeFlowId: config.activeFlowId ?? 'default',
    flows: backupFlows,
  })
})

app.post('/api/backup', async (req, res) => {
  const importedFlows = Array.isArray(req.body?.flows) ? req.body.flows : []
  if (!importedFlows.length) return res.status(400).json({ error: 'Backup JSON does not contain any flows.' })

  const existingFlows = await readFlowIndex()
  const nextFlows = [...existingFlows]
  const importedIds = []
  for (const item of importedFlows) {
    const sourceMeta = item.meta ?? item
    const sourceFlow = item.flow ?? item
    const name = String(sourceMeta?.name || sourceFlow?.name || 'Imported Flow')
    const baseId = safeFlowId(sourceMeta?.id) || slugifyFlowId(name)
    const id = ensureUniqueFlowId(baseId, nextFlows)
    const meta = normalizeFlowMeta({
      ...sourceMeta,
      id,
      name,
      createdAt: sourceMeta?.createdAt || new Date().toISOString(),
    })
    await writeFlow(id, sourceFlow)
    nextFlows.push(meta)
    importedIds.push(id)
  }

  await writeFlowIndex(nextFlows)
  log('info', `Imported ${importedIds.length} flow${importedIds.length === 1 ? '' : 's'} from backup.`)
  broadcastRunner()
  res.json({ flows: await readFlowIndex(), activeFlowId: config.activeFlowId ?? 'default', importedIds })
})

app.post('/api/starter-pack', async (_, res) => {
  const starterFlows = await getStarterPackFlows()
  const existingFlows = await readFlowIndex()
  const nextFlows = [...existingFlows]
  const importedIds = []

  for (const item of starterFlows) {
    const id = ensureUniqueFlowId(slugifyFlowId(item.name), nextFlows)
    const meta = normalizeFlowMeta({ id, name: item.name, createdAt: new Date().toISOString() })
    await writeFlow(id, item.flow)
    nextFlows.push(meta)
    importedIds.push(id)
  }

  await writeFlowIndex(nextFlows)
  log('info', `Added ${importedIds.length} starter flow${importedIds.length === 1 ? '' : 's'}.`)
  res.json({ flows: await readFlowIndex(), activeFlowId: config.activeFlowId ?? 'default', importedIds })
})

app.post('/api/voice/flow', async (req, res) => {
  try {
    const name = String(req.body?.name || req.body?.flow || req.body?.description || 'Voice Flow').trim()
    const result = await createGeneratedFlow(name, { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 0.85 } })
    log('info', `Voice created flow ${result.flow.name}.`)
    res.json({ ok: true, ...result, speech: `Created HAFlow flow ${result.flow.name}.` })
  } catch (error) {
    log('error', error.message)
    res.status(400).json({ ok: false, error: error.message, speech: `I could not create that flow. ${error.message}` })
  }
})

app.post('/api/voice/recipe', async (req, res) => {
  try {
    const description = String(req.body?.recipe || req.body?.description || req.body?.flow || '').trim()
    if (!description) throw new Error('Missing recipe description.')
    const entityHints = await getVoiceRecipeEntityHints(req.body)
    const generated = buildVoiceRecipeFlow(description, { entityHints })
    if (req.body?.dryRun) {
      return res.json({ ok: true, summary: generated.summary, speech: 'HAFlow understood the recipe.' })
    }
    const result = await createGeneratedFlow(generated.flowName, generated)
    log('info', `Voice created recipe flow ${result.flow.name}.`)
    res.json({ ok: true, ...result, summary: generated.summary, speech: `Created HAFlow recipe ${result.flow.name}.` })
  } catch (error) {
    log('error', error.message)
    res.status(400).json({ ok: false, error: error.message, speech: `I could not create that recipe. ${error.message}` })
  }
})

app.get('/api/logs', (_, res) => {
  res.json({ logs })
})

app.get('/api/run-history', (_, res) => {
  res.json({ history: runHistory })
})

app.delete('/api/logs', async (_, res) => {
  logs = []
  await writeJson(logPath, logs)
  broadcast({ type: 'logs-cleared' })
  res.json({ ok: true })
})

app.get('/api/runner', (_, res) => {
  res.json(getRunnerStatus())
})

app.put('/api/runner', async (req, res) => {
  if (req.body.flow) {
    cachedFlow = { nodes: req.body.flow.nodes ?? [], edges: req.body.flow.edges ?? [], viewport: normalizeViewport(req.body.flow.viewport) }
    await writeFlow(config.activeFlowId ?? 'default', cachedFlow)
  }

  config = { ...config, runnerEnabled: Boolean(req.body.enabled) }
  await writeJson(configPath, config)

  if (config.runnerEnabled) {
    reconnectHomeAssistant()
    log('info', 'Automatic runner enabled for all unpaused flows.')
  } else {
    log('warn', 'Automatic runner disabled.')
  }

  broadcastRunner()
  res.json(getRunnerStatus())
})

app.post('/api/run', async (req, res) => {
  if (await isActiveFlowPaused()) {
    const message = 'This flow is paused.'
    log('warn', message)
    return res.status(409).json({ ok: false, message })
  }

  if (manualRun) {
    manualRun.controller.abort()
    log('info', 'Manual run restarted; previous run was cancelled.')
  }

  const run = { id: crypto.randomUUID(), controller: new AbortController() }
  manualRun = run
  beginRunHistory(run.id)
  broadcastRunner()
  const startedAt = new Date().toISOString()
  const startNode = (req.body.nodes ?? []).find((node) => node.id === req.body.startNodeId)
  try {
    const flow = { nodes: req.body.nodes ?? [], edges: req.body.edges ?? [] }
    const result = await runFlow(flow, req.body.startNodeId, { runId: run.id, signal: run.controller.signal })
    await finishRunHistory({
      id: run.id,
      startedAt,
      trigger: req.body.startNodeId ? `Manual from ${startNode?.data?.label || req.body.startNodeId}` : 'Manual run',
      status: 'completed',
      message: result,
    })
    res.json({ ok: true, message: result })
  } catch (error) {
    if (isCancelledError(error)) {
      await finishRunHistory({
        id: run.id,
        startedAt,
        trigger: req.body.startNodeId ? `Manual from ${startNode?.data?.label || req.body.startNodeId}` : 'Manual run',
        status: 'cancelled',
        message: 'Previous run cancelled.',
      })
      res.json({ ok: true, message: 'Previous run cancelled.' })
      return
    }
    log('error', error.message)
    await finishRunHistory({
      id: run.id,
      startedAt,
      trigger: req.body.startNodeId ? `Manual from ${startNode?.data?.label || req.body.startNodeId}` : 'Manual run',
      status: 'failed',
      message: error.message,
    })
    res.status(400).json({ ok: false, message: error.message })
  } finally {
    if (manualRun?.id === run.id) manualRun = null
    broadcastRunner()
  }
})

app.post('/api/node-preview', async (req, res) => {
  try {
    const node = normalizeFlowNode(req.body.node ?? {})
    const nodes = Array.isArray(req.body.nodes) ? req.body.nodes.map(normalizeFlowNode) : []
    const edges = Array.isArray(req.body.edges) ? req.body.edges : []
    const result = await previewNode(node, { nodes, edges })
    res.json(result)
  } catch (error) {
    res.status(400).json({ status: 'error', title: 'Test failed', details: [error.message] })
  }
})

app.get('/health', (_, res) => {
  res.json({ ok: true })
})

app.use(express.static(distDir, { index: false }))
app.get(/.*/, async (req, res, next) => {
  try {
    const ingressPath = normalizeIngressPath(req.get('x-ingress-path'))
    const html = await fs.readFile(path.join(distDir, 'index.html'), 'utf8')
    res.type('html').send(ingressPath
      ? html.replace('<head>', `<head>\n    <base href="${escapeHtmlAttribute(ingressPath)}">`)
      : html)
  } catch (error) {
    next(error)
  }
})

const server = app.listen(port, () => {
  log('info', `HAFlow app listening on port ${port}.`)
  if (hasHomeAssistantCredentials()) reconnectHomeAssistant()
})

const wss = new WebSocketServer({ server, path: '/ws' })
wss.on('connection', (socket) => {
  clients.add(socket)
  socket.send(JSON.stringify({ type: 'status', status: publicConfig(false) }))
  socket.send(JSON.stringify({ type: 'runner', runner: getRunnerStatus() }))
  socket.send(JSON.stringify({ type: 'node-runtime', runtime: getNodeRuntimeSnapshot() }))
  socket.send(JSON.stringify({ type: 'run-history', history: runHistory }))
  socket.on('close', () => clients.delete(socket))
})

setInterval(() => {
  if (!config.runnerEnabled) return
  fireTimeTriggers().catch((error) => log('error', error.message))
}, 15_000)

async function runFlow(flow, startNodeId, options = {}) {
  const nodes = flow.nodes ?? []
  const edges = flow.edges ?? []
  if (!nodes.length) throw new Error('There are no nodes to run.')
  throwIfCancelled(options.signal)

  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const incoming = new Map(nodes.map((node) => [node.id, 0]))
  edges.forEach((edge) => incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1))

  const startNodes = startNodeId
    ? [nodesById.get(startNodeId)].filter(Boolean)
    : nodes.filter((node) => node.data?.kind !== 'comment' && (incoming.get(node.id) ?? 0) === 0)

  if (!startNodes.length) throw new Error('Pick a start node or add a trigger with no incoming link.')
  log('info', `Running ${startNodes.length} start node${startNodes.length === 1 ? '' : 's'}.`)

  const runOptions = { ...options, context: options.context ?? {} }
  await Promise.all(startNodes.map((startNode) => walk(startNode, nodesById, edges, new Set(), runOptions)))

  return 'Flow run completed.'
}

async function walk(node, nodesById, edges, visited, options = {}) {
  throwIfCancelled(options.signal)
  if (!node || visited.has(node.id)) return
  visited.add(node.id)

  if (node.data?.disabled) {
    log('warn', `${node.data?.label || node.id} is disabled; branch stopped.`)
    broadcastNodeState('stop', node, { runId: options.runId })
    return
  }

  broadcastNodeState('start', node, { runId: options.runId })
  let shouldContinue = false
  let sourceHandle = ''
  try {
    const executionResult = options.skipStartExecution === node.id ? true : await executeNode(node, { ...options, nodesById, edges })
    if (executionResult && typeof executionResult === 'object') {
      shouldContinue = executionResult.shouldContinue !== false
      sourceHandle = String(executionResult.sourceHandle ?? '')
    } else {
      shouldContinue = Boolean(executionResult)
    }
    throwIfCancelled(options.signal)
  } finally {
    broadcastNodeState(shouldContinue ? 'finish' : 'stop', node, { runId: options.runId })
  }

  if (!shouldContinue && node.data?.kind !== 'condition') return

  const nextEdges = edges.filter((edge) => {
    if (edge.source !== node.id) return false
    if (node.data?.kind === 'condition') {
      const expectedHandle = shouldContinue ? 'true' : 'false'
      return (edge.sourceHandle || 'true') === expectedHandle
    }
    if (sourceHandle) return edge.sourceHandle === sourceHandle
    return true
  })
  await Promise.all(nextEdges.map((edge) => walk(nodesById.get(edge.target), nodesById, edges, visited, options)))
}

async function executeNode(node, options = {}) {
  throwIfCancelled(options.signal)
  const data = node.data ?? {}
  if (data.kind === 'time') {
    const now = new Date()
    const currentMinute = now.getHours() * 60 + now.getMinutes()
    const match = await getScheduleMatch(node, now, currentMinute)
    const scheduleText = formatScheduleForLog(data)
    if (match.active) {
      log('info', `${data.label || 'Schedule'} continued (${scheduleText}).`)
      return true
    }
    log('warn', `${data.label || 'Schedule'} stopped; current time is outside ${scheduleText}.`)
    return false
  }

  if (data.kind === 'condition') {
    const rules = getConditionRules(data)
    const results = await Promise.all(rules.map(async (rule) => {
      const entity = rule.entityId ? await getEntity(rule.entityId) : null
      const actual = getEntityComparableValue(entity, rule.attribute)
      const expected = String(rule.value ?? '')
      const passed =
        rule.operator === 'not_equals' ? actual !== expected :
        rule.operator === 'contains' ? actual.includes(expected) :
        actual === expected
      return { actual, entityId: rule.entityId, expected, passed }
    }))
    const passed = Boolean(results.length) && (data.conditionMode === 'all' ? results.every((result) => result.passed) : results.some((result) => result.passed))
    const detail = results.map((result) => `${result.entityId || 'entity'} ${result.actual}${result.passed ? '=' : '!='}${result.expected}`).join(', ')
    log(passed ? 'info' : 'warn', `${data.label || 'Condition'} ${passed ? 'passed' : 'stopped'} (${detail}).`)
    return passed
  }

  if (data.kind === 'delay') {
    const seconds = Math.max(0, Number(data.seconds ?? 0))
    const delayUntil = new Date(Date.now() + seconds * 1000).toISOString()
    log('info', `Waiting ${seconds}s.`)
    await sleep(seconds * 1000, options.signal, (remainingMs) => {
      broadcastNodeState('progress', node, { delayUntil, remainingMs, runId: options.runId })
    })
    return true
  }

  if (data.kind === 'wait') {
    if (!data.entityId) throw new Error('Wait nodes need an entity.')
    await waitForEntityState(data.entityId, data.attribute, data.to, Number(data.timeoutSeconds ?? 300), options.signal)
    log('info', `${data.label || 'Wait'} continued after ${data.entityId} ${data.attribute || 'state'} reached ${data.to}.`)
    return true
  }

  if (data.kind === 'or') {
    log('info', `${data.label || 'OR'} continued.`)
    return true
  }

  if (data.kind === 'and') {
    const passed = await evaluateAndNode(node, options)
    log(passed ? 'info' : 'warn', `${data.label || 'AND'} ${passed ? 'continued' : 'stopped'}; ${passed ? 'all incoming sources are active' : 'not all incoming sources are active'}.`)
    return passed
  }

  if (data.kind === 'direction') {
    const direction = await resolveDirection(data)
    if (!direction) return false
    options.context.direction = direction
    options.context.lastDirection = direction
    options.context[`direction:${node.id}`] = direction
    await writeDirectionTarget(data.targetEntityId, direction)
    log('info', `${data.label || 'Direction'} resolved ${direction} and saved to ${data.targetEntityId}.`)
    return true
  }

  if (data.kind === 'end') {
    return true
  }

  if (data.kind === 'service') {
    const payload = parsePayload(data.payload)
    const entityIds = data.entityIds ?? []
    const serviceCalls = buildServiceCalls(data, payload, entityIds)
    for (const serviceCall of serviceCalls) {
      await callService(serviceCall.domain, serviceCall.service, serviceCall.payload)
      log('info', `Called ${serviceCall.domain}.${serviceCall.service}.`)
    }
    await verifyServiceResult(data, entityIds)
    return true
  }

  if (data.kind === 'notify') {
    const target = normalizeNotifyTarget(data)
    const service = target.includes('.') ? target.split('.')[1] : target
    const message = renderRunMessage(data.message || 'HAFlow notification', options.context)
    const payload = { message }
    if (data.title) payload.title = renderRunMessage(data.title, options.context)
    const notifyData = parseNotifyData(data.dataJson)
    applyPushoverNotifyOptions(data, notifyData)
    const actionToken = crypto.randomUUID().replaceAll('-', '')
    const actionable = applyNotifyActions(data, notifyData, options.context, actionToken)
    if (actionable.length && !notifyData.tag) notifyData.tag = `haflow_${actionToken}`
    const configuredTimeout = Number(data.notifyTimeoutSeconds ?? 60)
    const configuredResends = Number(data.notifyResendCount ?? 0)
    const timeoutSeconds = Number.isFinite(configuredTimeout) ? Math.max(1, configuredTimeout) : 60
    const resendCount = Number.isFinite(configuredResends) ? Math.max(0, Math.floor(configuredResends)) : 0
    const eventActions = actionable.filter((action) => action.waitForResponse)
    for (let attempt = 0; attempt <= resendCount; attempt += 1) {
      if (notifyData && Object.keys(notifyData).length) payload.data = notifyData
      if (!eventActions.length) {
        await callService('notify', service || 'notify', payload)
        log('info', `Sent notification via notify.${service || 'notify'}.`)
        return true
      }
      const response = await waitForNotificationAction(
        eventActions.map((action) => action.action),
        timeoutSeconds,
        options.signal,
        async () => {
          await callService('notify', service || 'notify', payload)
          log('info', `Sent notification via notify.${service || 'notify'}${attempt ? ` (resend ${attempt} of ${resendCount})` : ''}.`)
        },
      )
      if (response) {
        const selected = eventActions.find((action) => action.action === response.action)
        if (response.replyText !== undefined) options.context.notificationReply = response.replyText
        log('info', `${data.label || 'Notification'} continued from ${selected?.title || 'button response'}.`)
        return { shouldContinue: true, sourceHandle: selected?.sourceHandle || '' }
      }
      if (attempt < resendCount) log('warn', `${data.label || 'Notification'} received no response after ${timeoutSeconds}s; resending.`)
    }
    log('warn', `${data.label || 'Notification'} timed out without a response.`)
    return { shouldContinue: true, sourceHandle: 'timeout' }
  }

  if (data.kind === 'scene') {
    if (!data.entityId) throw new Error('Scene node needs an entity id.')
    await callService('scene', 'turn_on', { entity_id: data.entityId })
    log('info', `Activated ${data.entityId}.`)
    return true
  }

  if (data.kind === 'debug') {
    log('debug', data.message || 'Debug node reached.')
    return true
  }

  if (data.kind === 'comment') {
    return false
  }

  log('info', `${data.label || data.kind || 'Node'} triggered.`)
  return true
}

async function previewNode(node, { nodes = [], edges = [] } = {}) {
  const data = node.data ?? {}
  if (data.disabled) return { status: 'warn', title: 'Node is disabled', details: ['This node will stop its branch while it is disabled.'] }

  if (data.kind === 'state') {
    const rules = getStateTriggerRules(data)
    if (!rules.length) return { status: 'error', title: 'Trigger needs an entity', details: ['Select an entity before testing this trigger.'] }
    const details = await Promise.all(rules.map(async (rule) => {
      const entity = rule.entityId ? await getEntity(rule.entityId).catch(() => null) : null
      const current = entity?.state ?? 'unavailable'
      const fromText = hasStateFilter(rule.from) ? ` from ${rule.from}` : ''
      const toText = hasStateFilter(rule.to) ? ` to ${rule.to}` : ''
      return `${rule.entityId || rule.deviceName || 'Selected device'} is currently ${current}. This trigger waits for a change${fromText}${toText}.`
    }))
    return { status: 'info', title: 'Trigger test', details }
  }

  if (data.kind === 'event') {
    const details = [`This node waits for the ${data.eventType || 'selected'} event.`]
    if (data.entityId) details.push(`It is limited to ${data.entityId}.`)
    if (hasStateFilter(data.from) || hasStateFilter(data.to)) details.push(`It checks state changes${hasStateFilter(data.from) ? ` from ${data.from}` : ''}${hasStateFilter(data.to) ? ` to ${data.to}` : ''}.`)
    return { status: 'info', title: 'Event test', details }
  }

  if (data.kind === 'time') {
    const now = new Date()
    const currentMinute = now.getHours() * 60 + now.getMinutes()
    const match = await getScheduleMatch(node, now, currentMinute)
    const scheduleText = formatScheduleForLog(data)
    return match.active
      ? { status: 'pass', title: 'Schedule is active', details: [`The current time is inside ${scheduleText}.`] }
      : { status: 'stop', title: 'Schedule is not active', details: [`The current time is outside ${scheduleText}.`] }
  }

  if (data.kind === 'condition') {
    const rules = getConditionRules(data)
    if (!rules.length) return { status: 'error', title: 'Condition needs an entity', details: ['Select at least one entity before testing this condition.'] }
    const results = await Promise.all(rules.map(async (rule) => {
      const entity = rule.entityId ? await getEntity(rule.entityId).catch(() => null) : null
      const actual = getEntityComparableValue(entity, rule.attribute)
      const expected = String(rule.value ?? '')
      const passed =
        rule.operator === 'not_equals' ? actual !== expected :
        rule.operator === 'contains' ? actual.includes(expected) :
        actual === expected
      return { actual, expected, passed, rule }
    }))
    const passed = data.conditionMode === 'all' ? results.every((result) => result.passed) : results.some((result) => result.passed)
    return {
      status: passed ? 'pass' : 'stop',
      title: passed ? 'Condition passed' : 'Condition did not pass',
      details: results.map((result) => `${result.rule.entityId} ${formatPreviewOperator(result.rule.operator)} ${result.expected || 'blank'}; current value is ${result.actual || 'blank'}.`),
    }
  }

  if (data.kind === 'and') {
    const nodesById = new Map(nodes.map((item) => [item.id, item]))
    const passed = await evaluateAndNode(node, { nodesById, edges })
    return {
      status: passed ? 'pass' : 'stop',
      title: passed ? 'All incoming checks are active' : 'Not all incoming checks are active',
      details: [`Active states are ${data.activeStates || 'on, active, detected, open, occupied, home'}.`],
    }
  }

  if (data.kind === 'direction') {
    const direction = await resolveDirection(data)
    return direction
      ? { status: 'pass', title: 'Direction resolved', details: [`Current movement reads as ${direction}.`, data.targetEntityId ? `A real run would save ${direction} to ${data.targetEntityId}.` : 'Select a helper to save this value during a real run.'] }
      : { status: 'stop', title: 'Direction could not be resolved', details: ['Both entities must be active or recently changed enough to compare movement.'] }
  }

  if (data.kind === 'delay') return { status: 'info', title: 'Delay test', details: [`A real run would wait ${Math.max(0, Number(data.seconds ?? 0))} seconds.`] }

  if (data.kind === 'wait') {
    if (!data.entityId) return { status: 'error', title: 'Wait needs an entity', details: ['Select an entity before testing this wait.'] }
    const entity = await getEntity(data.entityId).catch(() => null)
    const actual = getEntityComparableValue(entity, data.attribute)
    const expected = String(data.to ?? '')
    const passed = actual === expected
    return {
      status: passed ? 'pass' : 'stop',
      title: passed ? 'Wait condition is already met' : 'Wait condition is not met',
      details: [`${data.entityId} is currently ${actual || 'blank'}. A real run waits until it is ${expected || 'blank'} or until ${Number(data.timeoutSeconds ?? 300)} seconds pass.`],
    }
  }

  if (data.kind === 'service') {
    const payload = parsePayload(data.payload)
    const entityIds = data.entityIds ?? []
    const serviceCalls = buildServiceCalls(data, payload, entityIds)
    return {
      status: 'info',
      title: 'Action test',
      details: serviceCalls.map((serviceCall) => `A real run would call ${serviceCall.domain}.${serviceCall.service}${formatPreviewTarget(serviceCall.payload.entity_id)}.`),
    }
  }

  if (data.kind === 'notify') {
    const target = normalizeNotifyTarget(data)
    const message = renderRunMessage(data.message || 'HAFlow notification', {})
    const actionCount = (Array.isArray(data.notifyActions) ? data.notifyActions : []).filter((action) => String(action?.title ?? '').trim()).length
    const details = [`A real run would send "${message}" through ${target || 'notify.notify'}.`]
    if (actionCount) details.push(`It would wait ${Number(data.notifyTimeoutSeconds ?? 60)} seconds per attempt for one of ${actionCount} buttons, with ${Number(data.notifyResendCount ?? 0)} additional resend attempts before Timeout.`)
    return { status: 'info', title: 'Notification test', details }
  }

  if (data.kind === 'scene') {
    return data.entityId
      ? { status: 'info', title: 'Scene test', details: [`A real run would turn on ${data.entityId}.`] }
      : { status: 'error', title: 'Scene needs an entity', details: ['Select a scene before testing this node.'] }
  }

  if (data.kind === 'debug') return { status: 'info', title: 'Debug test', details: [`A real run would write "${data.message || 'Debug node reached'}" to the run log.`] }
  if (data.kind === 'or') return { status: 'pass', title: 'OR continues', details: ['This node continues when any incoming path reaches it.'] }
  if (data.kind === 'end') return { status: 'stop', title: 'Branch ends here', details: ['A real run would stop this branch at this node.'] }
  if (data.kind === 'comment') return { status: 'info', title: 'Comment only', details: ['This note does not change how the flow runs.'] }

  return { status: 'info', title: 'Node test', details: ['This node has no special test behavior.'] }
}

function formatPreviewOperator(operator) {
  if (operator === 'not_equals') return 'is not'
  if (operator === 'contains') return 'contains'
  return 'is'
}

function formatPreviewTarget(entityId) {
  if (!entityId) return ''
  return Array.isArray(entityId) ? ` for ${entityId.join(', ')}` : ` for ${entityId}`
}

function buildServiceCalls(data, basePayload, entityIds) {
  if (['turn_on', 'turn_off'].includes(data.service) && entityIds.length) {
    const entityIdsByDomain = new Map()
    for (const entityId of entityIds) {
      const domain = String(entityId).split('.')[0]
      if (!domain) continue
      entityIdsByDomain.set(domain, [...(entityIdsByDomain.get(domain) ?? []), entityId])
    }

    if (entityIdsByDomain.size) {
      return Array.from(entityIdsByDomain.entries()).map(([domain, ids]) => {
        const payload = { ...basePayload }
        const entityTarget = ids.length === 1 ? ids[0] : ids
        payload.entity_id = entityTarget
        return { domain, service: data.service, payload }
      })
    }
  }

  const payload = { ...basePayload }
  if (entityIds.length) {
    const entityTarget = entityIds.length === 1 ? entityIds[0] : entityIds
    payload.entity_id = entityTarget
  }
  return [{ domain: data.domain, service: data.service, payload }]
}

async function fireTimeTriggers() {
  const now = new Date()
  const key = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`
  if (key === lastTimeKey) return
  lastTimeKey = key

  const currentMinute = now.getHours() * 60 + now.getMinutes()
  const currentTime = minutesToTime(currentMinute)
  const nextActiveWindows = new Set()
  for (const entry of await getRunnableFlowEntries()) {
    const timeNodes = entry.flow.nodes.filter((node) => !node.data?.disabled && node.data?.kind === 'time')
    for (const node of timeNodes) {
      const match = await getScheduleMatch(node, now, currentMinute)
      if (!match.active) continue
      if (match.windowKey) {
        nextActiveWindows.add(match.windowKey)
        if (activeScheduleWindows.has(match.windowKey)) continue
      }
      triggerNode(entry.flow, entry.meta, node, { reason: match.reason || `time ${currentTime}` }).catch((error) => log('error', error.message))
    }
  }
  activeScheduleWindows = nextActiveWindows
}

async function getScheduleMatch(node, now, currentMinute) {
  const data = node.data ?? {}

  if (data.scheduleMode === 'between') {
    const start = await resolveScheduleMinute(data.startType, data.startTime, now)
    const end = await resolveScheduleMinute(data.endType, data.endTime, now)
    if (!Number.isFinite(start) || !Number.isFinite(end)) return { active: false }
    if (!isScheduleDayEnabled(data.days, now, currentMinute, start, end)) return { active: false }
    const active = minuteIsInRange(currentMinute, start, end)
    if (!active) return { active: false }
    const windowDate = getScheduleWindowDate(now, currentMinute, start, end)
    return {
      active: true,
      reason: `between ${formatSchedulePointForLog(data.startType, data.startTime)} and ${formatSchedulePointForLog(data.endType, data.endTime)}`,
      windowKey: `${windowDate}-${node.id}-${start}-${end}`,
    }
  }

  if (!isScheduleDayEnabled(data.days, now, currentMinute)) return { active: false }
  const at = await resolveScheduleMinute(data.atType, data.at, now)
  if (!Number.isFinite(at) || at !== currentMinute) return { active: false }
  return { active: true, reason: `time ${formatSchedulePointForLog(data.atType, data.at)}` }
}

function isScheduleDayEnabled(scheduleDays, now, currentMinute, start = NaN, end = NaN) {
  const days = Array.isArray(scheduleDays) ? scheduleDays.map(Number).filter((day) => day >= 0 && day <= 6) : []
  if (!days.length || days.length === 7) return true
  let day = now.getDay()
  if (Number.isFinite(start) && Number.isFinite(end) && start > end && currentMinute < end) day = (day + 6) % 7
  return days.includes(day)
}

function getScheduleWindowDate(now, currentMinute, start, end) {
  const date = new Date(now)
  if (start > end && currentMinute < end) date.setDate(date.getDate() - 1)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

function minuteIsInRange(currentMinute, start, end) {
  if (start === end) return currentMinute === start
  if (start < end) return currentMinute >= start && currentMinute < end
  return currentMinute >= start || currentMinute < end
}

async function resolveScheduleMinute(type, time, date) {
  const scheduleType = SCHEDULE_TIME_TYPES.has(type) ? type : 'time'
  if (scheduleType === 'time') return parseTimeToMinutes(time)
  return getSolarMinute(scheduleType, date)
}

function parseTimeToMinutes(time) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(time || ''))
  if (!match) return NaN
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return NaN
  return hours * 60 + minutes
}

function minutesToTime(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

function formatSchedulePointForLog(type, time) {
  const scheduleType = SCHEDULE_TIME_TYPES.has(type) ? type : 'time'
  return scheduleType === 'time' ? minutesToTime(parseTimeToMinutes(time) || 0) : scheduleType
}

function formatScheduleForLog(data) {
  if (data.scheduleMode === 'between') {
    return `between ${formatSchedulePointForLog(data.startType, data.startTime)} and ${formatSchedulePointForLog(data.endType, data.endTime)}`
  }
  return `time ${formatSchedulePointForLog(data.atType, data.at)}`
}

async function getSolarMinute(type, date) {
  const haConfig = await getHomeAssistantConfig()
  const latitude = Number(haConfig?.latitude)
  const longitude = Number(haConfig?.longitude)
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    return calculateSolarMinute(type, date, latitude, longitude)
  }

  const sun = await getEntity('sun.sun').catch(() => null)
  const attribute = type === 'sunrise' ? 'next_rising' : 'next_setting'
  const value = sun?.attributes?.[attribute]
  const eventDate = value ? new Date(value) : null
  if (!eventDate || Number.isNaN(eventDate.getTime())) return NaN
  return eventDate.getHours() * 60 + eventDate.getMinutes()
}

async function getHomeAssistantConfig() {
  if (haConfigCache) return haConfigCache
  haConfigCache = await haRest('/api/config').catch(() => ({}))
  return haConfigCache
}

function calculateSolarMinute(type, date, latitude, longitude) {
  const zenith = 90.833
  const day = dayOfYear(date)
  const longitudeHour = longitude / 15
  const approximateTime = day + ((type === 'sunrise' ? 6 : 18) - longitudeHour) / 24
  const meanAnomaly = (0.9856 * approximateTime) - 3.289
  const trueLongitude = normalizeDegrees(meanAnomaly + (1.916 * sinDeg(meanAnomaly)) + (0.020 * sinDeg(2 * meanAnomaly)) + 282.634)
  let rightAscension = normalizeDegrees(atanDeg(0.91764 * tanDeg(trueLongitude)))
  rightAscension += Math.floor(trueLongitude / 90) * 90 - Math.floor(rightAscension / 90) * 90
  rightAscension /= 15

  const sinDec = 0.39782 * sinDeg(trueLongitude)
  const cosDec = Math.cos(Math.asin(sinDec))
  const cosHour = (cosDeg(zenith) - (sinDec * sinDeg(latitude))) / (cosDec * cosDeg(latitude))
  if (cosHour > 1 || cosHour < -1) return NaN

  const hour = (type === 'sunrise' ? 360 - acosDeg(cosHour) : acosDeg(cosHour)) / 15
  const localMeanTime = hour + rightAscension - (0.06571 * approximateTime) - 6.622
  const utcHour = normalizeHours(localMeanTime - longitudeHour)
  const eventDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 0, Math.round(utcHour * 60)))
  return eventDate.getHours() * 60 + eventDate.getMinutes()
}

function dayOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 0)
  return Math.floor((date - start) / 86_400_000)
}

function normalizeDegrees(value) {
  return ((value % 360) + 360) % 360
}

function normalizeHours(value) {
  return ((value % 24) + 24) % 24
}

function sinDeg(value) { return Math.sin(value * Math.PI / 180) }
function cosDeg(value) { return Math.cos(value * Math.PI / 180) }
function tanDeg(value) { return Math.tan(value * Math.PI / 180) }
function acosDeg(value) { return Math.acos(value) * 180 / Math.PI }
function atanDeg(value) { return Math.atan(value) * 180 / Math.PI }

async function evaluateAndNode(node, options = {}) {
  const incoming = (options.edges ?? []).filter((edge) => edge.target === node.id)
  if (!incoming.length) return false

  const sourceNodes = incoming.map((edge) => options.nodesById?.get(edge.source)).filter(Boolean)
  if (!sourceNodes.length) return false

  const activeStates = parseDirectionActiveStates(node.data?.activeStates)
  const results = await Promise.all(sourceNodes.map((sourceNode) => evaluateAndSourceNode(sourceNode, activeStates)))
  const detail = results.map((result) => `${result.label}: ${result.passed ? 'active' : result.reason}`).join(', ')
  if (detail) log(results.every((result) => result.passed) ? 'info' : 'warn', `${node.data?.label || 'AND'} checked ${detail}.`)
  return results.length > 0 && results.every((result) => result.passed)
}

async function evaluateAndSourceNode(sourceNode, activeStates) {
  const data = sourceNode.data ?? {}
  const label = data.label || sourceNode.id

  if (data.disabled) return { label, passed: false, reason: 'disabled' }

  if (data.kind === 'state') {
    const rules = getStateTriggerRules(data).filter((rule) => rule.entityId)
    if (!rules.length) return { label, passed: false, reason: 'no entity' }
    const ruleResults = await Promise.all(rules.map((rule) => evaluateAndStateRule(rule, activeStates)))
    return {
      label,
      passed: ruleResults.some((result) => result.passed),
      reason: ruleResults.map((result) => result.reason).join(' or ') || 'inactive',
    }
  }

  if (data.kind === 'condition') {
    const rules = getConditionRules(data).filter((rule) => rule.entityId)
    if (!rules.length) return { label, passed: false, reason: 'no condition' }
    const ruleResults = await Promise.all(rules.map(evaluateAndConditionRule))
    const passed = data.conditionMode === 'all'
      ? ruleResults.every((result) => result.passed)
      : ruleResults.some((result) => result.passed)
    return {
      label,
      passed,
      reason: ruleResults.map((result) => result.reason).join(data.conditionMode === 'all' ? ' and ' : ' or ') || 'failed',
    }
  }

  return { label, passed: false, reason: 'not stateful' }
}

async function evaluateAndStateRule(rule, activeStates) {
  const entity = await getEntity(rule.entityId).catch(() => null)
  const actual = String(entity?.state ?? '')
  const expected = String(rule.to ?? '')
  if (expected && expected !== ANY_CHANGE) {
    return { passed: actual === expected, reason: `${rule.entityId} is ${actual || 'unknown'}, expected ${expected}` }
  }
  return { passed: activeStates.has(actual.toLowerCase()), reason: `${rule.entityId} is ${actual || 'unknown'}` }
}

async function evaluateAndConditionRule(rule) {
  const entity = await getEntity(rule.entityId).catch(() => null)
  const actual = getEntityComparableValue(entity, rule.attribute)
  const expected = String(rule.value ?? '')
  const passed =
    rule.operator === 'not_equals' ? actual !== expected :
    rule.operator === 'contains' ? actual.includes(expected) :
    actual === expected
  return { passed, reason: `${rule.entityId} ${actual}${passed ? '=' : '!='}${expected}` }
}

async function resolveDirection(data) {
  if (!data.entityA || !data.entityB) throw new Error('Direction nodes need two entities.')
  if (!data.targetEntityId) throw new Error('Direction nodes need an input_text or input_select target helper.')

  const [entityA, entityB] = await Promise.all([getEntity(data.entityA), getEntity(data.entityB)])
  const activeStates = parseDirectionActiveStates(data.activeStates)
  if (!directionEntityIsActive(entityA, activeStates) || !directionEntityIsActive(entityB, activeStates)) {
    log('warn', `${data.label || 'Direction'} stopped; both entities are not active.`)
    return ''
  }

  const timeA = directionEntityChangedAt(entityA)
  const timeB = directionEntityChangedAt(entityB)
  if (!Number.isFinite(timeA) || !Number.isFinite(timeB) || timeA === timeB) {
    log('warn', `${data.label || 'Direction'} stopped; entity order could not be determined.`)
    return ''
  }

  return timeA < timeB ? String(data.directionAB || 'in') : String(data.directionBA || 'out')
}

function parseDirectionActiveStates(activeStates) {
  return new Set(String(activeStates || 'on, active, detected, open, occupied, home')
    .split(',')
    .map((state) => state.trim().toLowerCase())
    .filter(Boolean))
}

function directionEntityIsActive(entity, activeStates) {
  return activeStates.has(String(entity?.state ?? '').toLowerCase())
}

function directionEntityChangedAt(entity) {
  const time = Date.parse(entity?.last_changed || entity?.last_updated || '')
  return Number.isNaN(time) ? NaN : time
}

async function writeDirectionTarget(targetEntityId, direction) {
  const domain = String(targetEntityId || '').split('.')[0]
  if (domain === 'input_text') {
    await callService('input_text', 'set_value', { entity_id: targetEntityId, value: direction })
    return
  }
  if (domain === 'input_select') {
    await callService('input_select', 'select_option', { entity_id: targetEntityId, option: direction })
    return
  }
  throw new Error('Direction target must be an input_text or input_select helper.')
}

function renderRunMessage(message, context = {}) {
  return String(message ?? '').replace(/\{(direction|lastDirection)\}/gi, (token, key) => {
    return context[key] ?? context.direction ?? token
  })
}

function normalizeNotifyTarget(data) {
  const value = String(data.notifyService || data.target || 'notify').trim()
  return value.startsWith('notify.') ? value : `notify.${value || 'notify'}`
}

function parseNotifyData(dataJson) {
  if (!dataJson || !String(dataJson).trim()) return {}
  const parsed = JSON.parse(dataJson)
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
}

function applyPushoverNotifyOptions(data, notifyData) {
  const target = normalizeNotifyTarget(data).toLowerCase()
  if (!target.includes('pushover')) return
  if (data.pushoverPriority !== undefined && data.pushoverPriority !== '') notifyData.priority = Number(data.pushoverPriority)
  if (data.pushoverSound) notifyData.sound = String(data.pushoverSound)
}

async function handleHomeAssistantEvent(event) {
  if (!event?.event_type) return

  if (event.event_type === 'mobile_app_notification_action') resolveNotificationActionWaiters(event.data ?? {})

  if (event.event_type === 'state_changed' && event.data?.entity_id) {
    resolveEntityWaiters(event.data.entity_id, event.data.new_state?.state, event.data.new_state?.attributes ?? {})
    broadcast({
      type: 'entity-state',
      entity: {
        entity_id: event.data.entity_id,
        state: event.data.new_state?.state,
        attributes: event.data.new_state?.attributes ?? {},
        last_changed: event.data.new_state?.last_changed,
        last_updated: event.data.new_state?.last_updated,
      },
    })
  }

  const runnableEntries = await getRunnableFlowEntries()
  logWatchedStateChange(event, runnableEntries)

  if (!config.runnerEnabled) return
  logDeviceEventIfRelevant(event)

  for (const entry of runnableEntries) {
    const matches = findMatchingTriggerNodes(entry.flow, event)
    for (const node of matches) {
      triggerNode(entry.flow, entry.meta, node, { reason: event.event_type }).catch((error) => log('error', error.message))
    }
  }
}

function findMatchingTriggerNodes(flow, event) {
  return (flow.nodes ?? []).filter((node) => {
    const data = node.data ?? {}
    if (data.disabled) return false
    if (data.kind === 'event') {
      if (data.eventType && data.eventType !== event.event_type) return false
      if (event.event_type !== 'state_changed') return true

      const stateData = event.data ?? {}
      if (data.entityId && stateData.entity_id !== data.entityId) return false
      if (hasStateFilter(data.from) && stateData.old_state?.state !== data.from) return false
      if (hasStateFilter(data.to) && stateData.new_state?.state !== data.to) return false
      return true
    }
    if (data.kind !== 'state') return false

    const rules = getStateTriggerRules(data).map((rule) => ({
      ...rule,
      label: data.label,
      deviceIdentifiers: rule.deviceIdentifiers ?? data.deviceIdentifiers,
      buttonNumber: rule.buttonNumber ?? data.buttonNumber ?? inferGroupedButtonNumber(node, flow),
    }))
    if (event.event_type !== 'state_changed') return rules.some((rule) => deviceTriggerMatches(rule, event))
    return rules.some((rule) => stateTriggerMatches(rule, event.data ?? {}) || deviceTriggerMatches(rule, event))
  })
}

async function triggerNode(flow, flowMeta, node, { reason }) {
  const runKey = `${flowMeta.id}:${node.id}`
  const existingRun = runningTriggers.get(runKey)
  if (existingRun) {
    existingRun.controller.abort()
    log('info', `${flowMeta.name}: ${node.data?.label || node.id} restarted; previous run was cancelled.`)
  }

  const run = { id: crypto.randomUUID(), controller: new AbortController() }
  runningTriggers.set(runKey, run)
  beginRunHistory(run.id)
  broadcastRunner()
  const startedAt = new Date().toISOString()
  try {
    log('activated', `Flow Activated: ${flowMeta.name}: ${node.data?.label || node.id}`)
    const result = await runFlow(flow, node.id, { runId: run.id, skipStartExecution: node.id, signal: run.controller.signal })
    await finishRunHistory({
      id: run.id,
      startedAt,
      trigger: `${flowMeta.name}: ${node.data?.label || node.id} by ${reason}`,
      status: 'completed',
      message: result,
    })
  } catch (error) {
    if (isCancelledError(error)) {
      log('info', `${flowMeta.name}: ${node.data?.label || node.id} previous run stopped.`)
      await finishRunHistory({
        id: run.id,
        startedAt,
        trigger: `${flowMeta.name}: ${node.data?.label || node.id} by ${reason}`,
        status: 'cancelled',
        message: 'Previous run stopped.',
      })
    } else {
      await finishRunHistory({
        id: run.id,
        startedAt,
        trigger: `${flowMeta.name}: ${node.data?.label || node.id} by ${reason}`,
        status: 'failed',
        message: error.message,
      })
      throw error
    }
  } finally {
    if (runningTriggers.get(runKey)?.id === run.id) runningTriggers.delete(runKey)
    broadcastRunner()
  }
}

function reconnectHomeAssistant() {
  closeHomeAssistantSocket()
  const ha = getHomeAssistantConnection()
  if (!ha.token || !ha.wsUrl) {
    broadcastRunner()
    return
  }

  haSocket = new WebSocket(ha.wsUrl)

  haSocket.on('message', (raw) => {
    const message = JSON.parse(raw.toString())
    if (message.type === 'auth_required') {
      haSocket.send(JSON.stringify({ type: 'auth', access_token: ha.token }))
      return
    }

    if (message.type === 'auth_ok') {
      haSocket.send(JSON.stringify({ id: haMessageId++, type: 'subscribe_events' }))
      log('info', 'Subscribed to Home Assistant events.')
      logRunnerWatchSummary().catch((error) => log('warn', `Could not inspect watched triggers: ${error.message}`))
      refreshDeviceRegistry().catch((error) => log('warn', `Could not load Home Assistant devices: ${error.message}`))
      broadcastRunner()
      return
    }

    if (message.type === 'auth_invalid') {
      log('error', 'Home Assistant WebSocket authentication failed.')
      return
    }

    if (message.type === 'event') handleHomeAssistantEvent(message.event).catch((error) => log('error', error.message))
  })

  haSocket.on('open', () => broadcastRunner())
  haSocket.on('close', () => scheduleReconnect())
  haSocket.on('error', () => scheduleReconnect())
}

function scheduleReconnect() {
  broadcastRunner()
  if (!hasHomeAssistantCredentials() || reconnectTimer) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    reconnectHomeAssistant()
  }, 5000)
}

async function refreshDeviceRegistry() {
  const [devices, registryEntities] = await Promise.all([
    haWsCommand('config/device_registry/list'),
    haWsCommand('config/entity_registry/list'),
  ])
  deviceRegistryById = new Map(devices.map((device) => [device.id, device]))
  entityRegistryDeviceByEntityId = new Map(registryEntities
    .filter((entity) => entity.entity_id && entity.device_id)
    .map((entity) => [entity.entity_id, entity.device_id]))
}

function closeHomeAssistantSocket() {
  if (reconnectTimer) clearTimeout(reconnectTimer)
  reconnectTimer = null
  if (haSocket) {
    haSocket.removeAllListeners()
    haSocket.close()
  }
  haSocket = null
  broadcastRunner()
}

async function getEntity(entityId) {
  return haRest(`/api/states/${entityId}`)
}

async function callService(domain, service, payload) {
  if (!domain || !service) throw new Error('Service nodes need a domain and service.')
  return haRest(`/api/services/${domain}/${service}`, {
    method: 'POST',
    body: JSON.stringify(payload ?? {}),
  })
}

async function verifyServiceResult(data, entityIds) {
  if (!entityIds.length) return
  const expectedState =
    data.domain === 'light' && data.service === 'turn_on' ? 'on' :
    data.domain === 'light' && data.service === 'turn_off' ? 'off' :
    data.service === 'turn_on' ? 'on' :
    data.service === 'turn_off' ? 'off' :
    ''
  if (!expectedState) return

  let states = []
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 250))
    states = await Promise.all(entityIds.map(async (entityId) => {
      try {
        const entity = await getEntity(entityId)
        return { entityId, state: entity.state }
      } catch (error) {
        return { entityId, state: `error: ${error.message}` }
      }
    }))
    if (states.every((entity) => entity.state === expectedState)) break
  }
  const failed = states.filter((entity) => entity.state !== expectedState)
  if (failed.length) {
    throw new Error(`${data.label || `${data.domain}.${data.service}`} did not reach ${expectedState}: ${failed.map((entity) => `${entity.entityId} is ${entity.state}`).join(', ')}.`)
  }
  log('info', `${data.label || `${data.domain}.${data.service}`} verified ${expectedState}.`)
}

async function haRest(endpoint, options = {}) {
  const ha = getHomeAssistantConnection()
  if (!ha.restBaseUrl || !ha.token) throw new Error('Home Assistant URL and token are required.')
  const response = await fetch(`${ha.restBaseUrl}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${ha.token}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  })
  if (!response.ok) {
    const details = await response.text().catch(() => '')
    throw new Error(`Home Assistant returned ${response.status} for ${endpoint}${details ? `: ${details}` : ''}.`)
  }
  return response.json()
}

async function haWsCommand(command) {
  const ha = getHomeAssistantConnection()
  if (!ha.wsUrl || !ha.token) throw new Error('Home Assistant URL and token are required.')

  return new Promise((resolve, reject) => {
    const socket = new WebSocket(ha.wsUrl)
    const id = 1
    const timeout = setTimeout(() => {
      socket.close()
      reject(new Error(`Home Assistant WebSocket command timed out: ${command}`))
    }, 8000)

    socket.on('message', (raw) => {
      const message = JSON.parse(raw.toString())

      if (message.type === 'auth_required') {
        socket.send(JSON.stringify({ type: 'auth', access_token: ha.token }))
        return
      }

      if (message.type === 'auth_ok') {
        socket.send(JSON.stringify({ id, type: command }))
        return
      }

      if (message.type === 'auth_invalid') {
        clearTimeout(timeout)
        socket.close()
        reject(new Error('Home Assistant WebSocket authentication failed.'))
        return
      }

      if (message.id === id) {
        clearTimeout(timeout)
        socket.close()
        if (message.success) resolve(message.result ?? [])
        else reject(new Error(message.error?.message || `Home Assistant rejected ${command}.`))
      }
    })

    socket.on('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
  })
}

function enrichEntity(state, registryByEntityId = new Map(), deviceById = new Map(), areaById = new Map()) {
  const registry = registryByEntityId.get(state.entity_id) ?? {}
  const device = registry.device_id ? deviceById.get(registry.device_id) : null
  const areaId = registry.area_id || registry.area || device?.area_id || device?.area || ''
  const area = areaId ? areaById.get(areaId) : null
  const domain = state.entity_id.split('.')[0]
  const deviceClass = state.attributes?.device_class || registry.device_class || registry.original_device_class || ''

  return {
    ...state,
    catalogType: 'entity',
    area_id: areaId,
    areaName: area?.name || 'Unassigned',
    domain,
    deviceType: getDeviceType(domain, deviceClass, state.entity_id),
    friendlyName: state.attributes?.friendly_name || registry.name || state.entity_id,
    valueOptions: getEntityValueOptions(state),
  }
}

function enrichDevice(device, areaById = new Map()) {
  const area = device.area_id ? areaById.get(device.area_id) : null
  const name = device.name_by_user || device.name || device.model || device.id
  const manufacturer = device.manufacturer || ''
  const model = device.model || ''

  return {
    catalogType: 'device',
    entity_id: `device.${device.id}`,
    deviceId: device.id,
    domain: 'device',
    state: model || 'Device',
    attributes: {
      identifiers: device.identifiers,
      manufacturer,
      model,
      name,
    },
    area_id: device.area_id || '',
    areaName: area?.name || 'Unassigned',
    deviceType: 'Device',
    friendlyName: name,
    valueOptions: [],
  }
}

async function getEntityObservedValues(entityId, state) {
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
  const history = await haRest(`/api/history/period/${since}?filter_entity_id=${encodeURIComponent(entityId)}&minimal_response`)
  const observed = Array.isArray(history?.[0]) ? history[0].map((item) => item.state) : []
  const values = Array.from(new Set([...getEntityValueOptions(state), ...observed].filter(Boolean)))
  if (values.some((value) => ['on', 'off'].includes(value))) values.push('on', 'off')
  return Array.from(new Set(values)).sort()
}

function getEntityValueOptions(state) {
  const attributeOptions = Array.isArray(state.attributes?.options) ? state.attributes.options : []
  return Array.from(new Set([state.state, ...attributeOptions].filter(Boolean)))
}

function getDeviceType(domain, deviceClass, entityId = '') {
  const normalizedClass = String(deviceClass || '').replace(/_/g, ' ')
  if (domain === 'binary_sensor' && (['motion', 'occupancy'].includes(String(deviceClass)) || String(entityId).includes('motion'))) return 'Motion'
  if (normalizedClass) return titleCase(normalizedClass)

  const labels = {
    binary_sensor: 'Binary Sensor',
    button: 'Button',
    climate: 'Climate',
    cover: 'Cover',
    fan: 'Fan',
    humidifier: 'Humidifier',
    light: 'Light',
    lock: 'Lock',
    media_player: 'Media Player',
    number: 'Number',
    person: 'Person',
    scene: 'Scene',
    script: 'Script',
    select: 'Select',
    sensor: 'Sensor',
    switch: 'Switch',
    update: 'Update',
    vacuum: 'Vacuum',
    weather: 'Weather',
  }

  return labels[domain] || titleCase(domain.replace(/_/g, ' '))
}

function titleCase(value) {
  return String(value)
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function compareCatalogEntities(a, b) {
  return a.areaName.localeCompare(b.areaName) ||
    a.deviceType.localeCompare(b.deviceType) ||
    String(a.friendlyName || '').localeCompare(String(b.friendlyName || '')) ||
    a.entity_id.localeCompare(b.entity_id)
}

async function getStatus() {
  try {
    const [entities, serviceList] = await Promise.all([haRest('/api/states'), haRest('/api/services')])
    const status = {
      ...publicConfig(true),
      entityCount: entities.length,
      serviceCount: serviceList.length,
    }
    broadcast({ type: 'status', status })
    return status
  } catch {
    const status = publicConfig(false)
    broadcast({ type: 'status', status })
    return status
  }
}

function getRunnerStatus() {
  const activeFlowId = config.activeFlowId ?? 'default'
  const flowPaused = Boolean(cachedFlowMeta?.paused)
  return {
    enabled: Boolean(config.runnerEnabled),
    connected: haSocket?.readyState === WebSocket.OPEN,
    flowPaused,
    running: runningTriggers.size + (manualRun ? 1 : 0),
    nodeRuntime: getNodeRuntimeSnapshot(),
    triggerCount: flowPaused ? 0 : cachedFlow.nodes.filter((node) => !node.data?.disabled && ['state', 'event', 'time'].includes(node.data?.kind)).length,
    activeFlowId,
  }
}

function broadcastRunner() {
  broadcast({ type: 'runner', runner: getRunnerStatus() })
}

function broadcastNodeState(state, node, extra = {}) {
  const time = new Date().toISOString()
  if (extra.runId && state !== 'progress') {
    const events = activeRunEvents.get(extra.runId) ?? []
    events.push({
      nodeId: node.id,
      label: node.data?.label || node.id,
      kind: node.data?.kind || 'node',
      state,
      time,
    })
    activeRunEvents.set(extra.runId, events.slice(-80))
  }

  if (state !== 'progress') {
    nodeRuntime.set(node.id, {
      ...(nodeRuntime.get(node.id) ?? {}),
      kind: node.data?.kind || 'node',
      label: node.data?.label || node.id,
      lastExecutedAt: time,
      remainingMs: undefined,
      runId: extra.runId,
      status: state,
    })
    persistNodeRuntime()
  } else {
    nodeRuntime.set(node.id, {
      ...(nodeRuntime.get(node.id) ?? {}),
      delayUntil: extra.delayUntil,
      remainingMs: extra.remainingMs,
      runId: extra.runId,
      status: state,
    })
    persistNodeRuntime()
  }

  broadcast({
    type: 'node-state',
    node: {
      id: node.id,
      state,
      label: node.data?.label || node.id,
      kind: node.data?.kind || 'node',
      time,
      runId: extra.runId,
      ...extra,
    },
  })
}

function beginRunHistory(runId) {
  activeRunEvents.set(runId, [])
}

async function finishRunHistory({ id, startedAt, trigger, status, message }) {
  const completedAt = new Date().toISOString()
  const events = activeRunEvents.get(id) ?? []
  activeRunEvents.delete(id)
  const entry = {
    id,
    startedAt,
    completedAt,
    durationMs: Math.max(0, Date.parse(completedAt) - Date.parse(startedAt)),
    trigger,
    status,
    message,
    nodes: events.filter((event) => event.state === 'start').map((event) => ({
      id: event.nodeId,
      label: event.label,
      kind: event.kind,
    })),
    stoppedAt: events.filter((event) => event.state === 'stop').map((event) => ({
      id: event.nodeId,
      label: event.label,
      kind: event.kind,
    })),
  }
  runHistory = [entry, ...runHistory].slice(0, 50)
  await writeJson(runHistoryPath, runHistory)
  broadcast({ type: 'run-history', history: runHistory })
}

function normalizeRunHistory(history) {
  return Array.isArray(history) ? history.filter((entry) => entry?.id && entry?.startedAt).slice(0, 50) : []
}

function persistNodeRuntime() {
  const durableRuntime = Object.fromEntries(Array.from(nodeRuntime.entries()).map(([nodeId, runtime]) => [
    nodeId,
    {
      delayUntil: runtime.status === 'progress' ? runtime.delayUntil : undefined,
      kind: runtime.kind,
      label: runtime.label,
      lastExecutedAt: runtime.lastExecutedAt,
      remainingMs: runtime.status === 'progress' ? getRemainingMs(runtime) : undefined,
      runId: runtime.runId,
      status: runtime.status,
    },
  ]))
  writeJson(runtimePath, durableRuntime).catch(() => {})
}

function getNodeRuntimeSnapshot() {
  return Object.fromEntries(Array.from(nodeRuntime.entries()).map(([nodeId, runtime]) => [
    nodeId,
    {
      ...runtime,
      remainingMs: runtime.status === 'progress' ? getRemainingMs(runtime) : undefined,
    },
  ]))
}

function getRemainingMs(runtime) {
  if (runtime?.delayUntil) return Math.max(0, Date.parse(runtime.delayUntil) - Date.now())
  return runtime?.remainingMs
}

async function waitForEntityState(entityId, attribute, targetState, timeoutSeconds, signal) {
  throwIfCancelled(signal)
  const current = await getEntity(entityId)
  if (!targetState || getEntityComparableValue(current, attribute) === String(targetState)) return

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeout)
      waiters = waiters.filter((waiter) => waiter !== waiterEntry)
      signal?.removeEventListener('abort', onAbort)
    }
    const onAbort = () => {
      cleanup()
      reject(createCancelledError())
    }
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error(`${entityId} did not reach ${targetState} within ${timeoutSeconds}s.`))
    }, Math.max(1, timeoutSeconds) * 1000)

    const waiterEntry = {
      entityId,
      attribute: attribute || 'state',
      targetState,
      resolve: () => {
        cleanup()
        resolve()
      },
    }

    signal?.addEventListener('abort', onAbort, { once: true })
    waiters.push(waiterEntry)
  })
}

function sleep(milliseconds, signal, onProgress) {
  throwIfCancelled(signal)
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeout)
      clearInterval(interval)
      signal?.removeEventListener('abort', onAbort)
    }
    const onAbort = () => {
      cleanup()
      reject(createCancelledError())
    }
    const timeout = setTimeout(() => {
      cleanup()
      resolve()
    }, milliseconds)
    const startedAt = Date.now()
    const publishProgress = () => {
      onProgress?.(Math.max(0, milliseconds - (Date.now() - startedAt)))
    }
    const interval = setInterval(publishProgress, 1000)

    publishProgress()
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function throwIfCancelled(signal) {
  if (signal?.aborted) throw createCancelledError()
}

function createCancelledError() {
  const error = new Error('Flow run cancelled.')
  error.name = 'AbortError'
  return error
}

function isCancelledError(error) {
  return error?.name === 'AbortError'
}

function resolveEntityWaiters(entityId, state, attributes = {}) {
  const matching = waiters.filter((waiter) => {
    if (waiter.entityId !== entityId) return false
    const actual = waiter.attribute === 'state' ? state : formatComparableValue(attributes[waiter.attribute])
    return actual === waiter.targetState
  })
  waiters = waiters.filter((waiter) => !matching.includes(waiter))
  matching.forEach((waiter) => waiter.resolve())
}

function getEntityComparableValue(entity, attribute = 'state') {
  if (!entity) return ''
  if (!attribute || attribute === 'state') return String(entity.state ?? '')
  return formatComparableValue(entity.attributes?.[attribute])
}

function getConditionRules(data) {
  if (Array.isArray(data?.conditions) && data.conditions.length) return data.conditions
  if (data?.entityId) {
    return [{
      entityId: data.entityId,
      attribute: data.attribute || 'state',
      operator: data.operator || 'equals',
      value: data.value ?? '',
    }]
  }
  return []
}

function getStateTriggerRules(data) {
  if (Array.isArray(data?.triggers) && data.triggers.length) return data.triggers
  if (data?.entityId) {
    return [{
      entityId: data.entityId,
      deviceId: data.deviceId ?? '',
      deviceIdentifiers: data.deviceIdentifiers ?? [],
      buttonNumber: data.buttonNumber,
      from: data.from ?? '',
      to: data.to ?? '',
    }]
  }
  return []
}

function stateTriggerMatches(rule, stateData) {
  if (!rule.entityId && !rule.deviceId) return false
  const hasButtonFilter = rule.buttonNumber !== undefined && rule.buttonNumber !== null && rule.buttonNumber !== ''
  if (rule.entityId && stateData.entity_id !== rule.entityId) {
    if (hasButtonFilter) return false
    const entityDeviceId = getEntityDeviceId(stateData.entity_id)
    if (!rule.deviceId || entityDeviceId !== rule.deviceId) return false
  }
  if (!rule.entityId && rule.deviceId) {
    if (hasButtonFilter) return false
    if (getEntityDeviceId(stateData.entity_id) !== rule.deviceId) return false
  }
  if (hasStateFilter(rule.from) && stateData.old_state?.state !== rule.from) return false
  if (hasStateFilter(rule.to) && stateData.new_state?.state !== rule.to) return false
  return true
}

function getEntityDeviceId(entityId) {
  if (!entityId) return ''
  if (String(entityId).startsWith('device.')) return String(entityId).slice('device.'.length)
  return entityRegistryDeviceByEntityId.get(entityId) || ''
}

function deviceTriggerMatches(rule, event) {
  if (!rule.deviceId) return false
  const data = event.data ?? {}
  const eventDeviceId = data.device_id || data.deviceId || data.device?.id || data.device
  const serials = getRuleSerials(rule)
  const eventSerial = data.serial || data.device_serial || data.serial_number || data.id
  const matchedDevice = eventDeviceId === rule.deviceId || (eventSerial && serials.includes(String(eventSerial)))
  if (!matchedDevice) return false
  if (data.action && data.action !== 'press') return false
  const buttonNumber = rule.buttonNumber ?? getButtonNumberFromLabel(rule.label)
  if (buttonNumber !== undefined && buttonNumber !== null && buttonNumber !== '') {
    const eventButton = data.button_number ?? data.buttonNumber ?? data.button_id ?? data.button
    if (String(eventButton) !== String(buttonNumber)) return false
  }
  if (hasStateFilter(rule.from) || hasStateFilter(rule.to)) return false
  return true
}

function logDeviceEventIfRelevant(event) {
  const tracked = getTrackedDeviceTriggerDetails()
  if (!tracked.deviceIds.size && !tracked.serials.size) return
  const data = event.data ?? {}
  const eventDeviceId = data.device_id || data.deviceId || data.device?.id || data.device
  const eventSerial = data.serial || data.device_serial || data.serial_number || data.id
  const isTracked = (eventDeviceId && tracked.deviceIds.has(String(eventDeviceId))) || (eventSerial && tracked.serials.has(String(eventSerial)))
  if (!isTracked) return

  const eventButton = data.button_number ?? data.buttonNumber ?? data.button_id ?? data.button ?? data.action ?? data.type ?? data.subtype
  log('debug', `HA event ${event.event_type}: serial=${eventSerial || 'none'} device=${eventDeviceId || 'none'} button=${eventButton || 'none'} data=${JSON.stringify(data).slice(0, 500)}`)
}

function logWatchedStateChange(event, entries) {
  if (event.event_type !== 'state_changed') return
  const entityId = event.data?.entity_id
  if (!entityId) return

  const watched = getWatchedEntityTriggerDetails(entries)
  const watchers = watched.get(entityId) ?? []
  if (!watchers.length) return

  const oldState = event.data?.old_state?.state ?? 'unknown'
  const newState = event.data?.new_state?.state ?? 'unknown'
  const matched = entries.flatMap((entry) => findMatchingTriggerNodes(entry.flow, event).map((node) => `${entry.meta.name}: ${node.data?.label || node.id}`))
  const runnerNote = config.runnerEnabled ? '' : ' Runner is disabled, so no flow was run.'
  log(matched.length ? 'info' : 'debug', `Trigger entity changed: ${entityId} ${oldState} -> ${newState}; ${matched.length ? `matched ${matched.join(', ')}` : `no match for ${watchers.join(', ')}`}.${runnerNote}`)
}

function getWatchedEntityTriggerDetails(entries) {
  const watched = new Map()
  for (const entry of entries) {
    for (const node of entry.flow.nodes ?? []) {
      const data = node.data ?? {}
      if (data.disabled) continue
      const entityIds = []
      if (data.kind === 'event' && data.entityId) entityIds.push(data.entityId)
      if (data.kind === 'state') {
        for (const rule of getStateTriggerRules(data)) {
          if (rule.entityId) entityIds.push(rule.entityId)
          if (rule.deviceId) entityIds.push(...getDeviceEntityIds(rule.deviceId))
        }
      }
      for (const entityId of entityIds) {
        const existing = watched.get(entityId) ?? []
        existing.push(`${entry.meta.name}: ${data.label || node.id}`)
        watched.set(entityId, existing)
      }
    }
  }
  return watched
}

async function logRunnerWatchSummary() {
  const entries = await getRunnableFlowEntries()
  const triggerCount = entries.reduce((total, entry) => total + (entry.flow.nodes ?? []).filter((node) => !node.data?.disabled && ['state', 'event', 'time'].includes(node.data?.kind)).length, 0)
  const watchedEntities = Array.from(getWatchedEntityTriggerDetails(entries).keys()).sort()
  log(config.runnerEnabled ? 'info' : 'warn', `${config.runnerEnabled ? 'Watching' : 'Runner disabled; configured'} ${triggerCount} trigger node${triggerCount === 1 ? '' : 's'} across ${entries.length} unpaused flow${entries.length === 1 ? '' : 's'} (${watchedEntities.length} entity trigger${watchedEntities.length === 1 ? '' : 's'}).`)
  if (watchedEntities.length) log('info', `Watched trigger entities: ${watchedEntities.slice(0, 24).join(', ')}${watchedEntities.length > 24 ? `, +${watchedEntities.length - 24} more` : ''}.`)
}

function getTrackedDeviceTriggerDetails() {
  const deviceIds = new Set()
  const serials = new Set()
  for (const node of cachedFlow.nodes ?? []) {
    if (node.data?.kind !== 'state') continue
    for (const rule of getStateTriggerRules(node.data)) {
      const deviceId = rule.deviceId || node.data.deviceId
      if (!deviceId) continue
      deviceIds.add(String(deviceId))
      for (const serial of getRuleSerials({ ...rule, deviceId, deviceIdentifiers: rule.deviceIdentifiers ?? node.data.deviceIdentifiers })) {
        serials.add(serial)
      }
    }
  }
  return { deviceIds, serials }
}

function getDeviceEntityIds(deviceId) {
  if (!deviceId) return []
  return Array.from(entityRegistryDeviceByEntityId.entries())
    .filter(([, entityDeviceId]) => entityDeviceId === deviceId)
    .map(([entityId]) => entityId)
}

function getRuleSerials(rule) {
  const registryIdentifiers = rule.deviceId ? (deviceRegistryById.get(rule.deviceId)?.identifiers ?? []) : []
  return [...(rule.deviceIdentifiers ?? []), ...registryIdentifiers]
    .flatMap((identifier) => Array.isArray(identifier) ? identifier.slice(1) : [identifier])
    .map((value) => String(value))
}

function getButtonNumberFromLabel(label) {
  const match = String(label || '').match(/\bbutton\s+(\d+)\b/i)
  return match ? Number(match[1]) : undefined
}

function inferGroupedButtonNumber(node, flow = cachedFlow) {
  if (!node?.parentId || node.data?.kind !== 'state') return getButtonNumberFromLabel(node?.data?.label)
  const deviceId = node.data.deviceId || getStateTriggerRules(node.data)[0]?.deviceId
  if (!deviceId) return getButtonNumberFromLabel(node.data?.label)
  const siblings = (flow.nodes ?? [])
    .filter((item) => {
      if (item.parentId !== node.parentId || item.data?.kind !== 'state') return false
      const siblingDeviceId = item.data.deviceId || getStateTriggerRules(item.data)[0]?.deviceId
      return siblingDeviceId === deviceId
    })
    .sort((first, second) => (first.position?.y ?? 0) - (second.position?.y ?? 0))
  const index = siblings.findIndex((item) => item.id === node.id)
  return index >= 0 ? (LUTRON_5_BUTTON_PICO_BUTTONS[index] ?? index + 1) : getButtonNumberFromLabel(node.data?.label)
}

function formatComparableValue(value) {
  if (Array.isArray(value) || (value && typeof value === 'object')) return JSON.stringify(value)
  return String(value ?? '')
}

function hasStateFilter(value) {
  return Boolean(value && value !== ANY_CHANGE)
}

function parsePayload(raw) {
  if (!raw || !String(raw).trim()) return {}
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error('Service payload must be valid JSON.')
  }
}

function getHomeAssistantConnection() {
  return {
    restBaseUrl: 'http://supervisor/core',
    token: supervisorToken,
    wsUrl: 'ws://supervisor/core/websocket',
  }
}

function hasHomeAssistantCredentials() {
  const ha = getHomeAssistantConnection()
  return Boolean(ha.restBaseUrl && ha.wsUrl && ha.token)
}

function normalizeIngressPath(value) {
  const pathValue = String(value || '').trim()
  if (!pathValue || !pathValue.startsWith('/')) return ''
  return pathValue.endsWith('/') ? pathValue : `${pathValue}/`
}

function escapeHtmlAttribute(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function publicConfig(connected) {
  return { connected, entityCount: 0, serviceCount: 0 }
}

function log(level, message) {
  if (message === 'Flow saved.') return
  const entry = { id: crypto.randomUUID(), time: new Date().toISOString(), level, message }
  const logger = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
  logger(`[${entry.time}] ${level.toUpperCase()} ${message}`)
  logs = [entry, ...logs].slice(0, 200)
  writeJson(logPath, logs).catch(() => {})
  broadcast({ type: 'log', entry })
}

async function createGeneratedFlow(baseName, generated) {
  const flows = await readFlowIndex()
  const name = ensureUniqueFlowName(baseName || 'Voice Flow', flows)
  const flow = normalizeFlowMeta({
    id: ensureUniqueFlowId(slugifyFlowId(name), flows),
    name,
    createdAt: new Date().toISOString(),
  })
  const flowData = normalizeFlow({
    nodes: generated.nodes ?? [],
    edges: generated.edges ?? [],
    viewport: normalizeViewport(generated.viewport || { x: 0, y: 0, zoom: 0.85 }),
  })
  await writeFlow(flow.id, flowData)
  await writeFlowIndex([...flows, flow])
  config = { ...config, activeFlowId: flow.id }
  await writeJson(configPath, config)
  cachedFlow = flowData
  cachedFlowMeta = flow
  invalidateRunnableFlowCache()
  broadcastRunner()
  return { flow, flows: await readFlowIndex(), activeFlowId: flow.id }
}

async function getVoiceRecipeEntityHints(body = {}) {
  const explicitHints = normalizeVoiceEntityHints([
    body.entities,
    body.entityHints,
    body.resolvedEntities,
    body.slots?.entities,
    body.slots?.entity,
  ].flatMap((value) => Array.isArray(value) ? value : value ? [value] : []))
  if (explicitHints.length) return explicitHints

  try {
    const states = await haRest('/api/states')
    return normalizeVoiceEntityHints(states)
  } catch {
    return []
  }
}

function normalizeVoiceEntityHints(items = []) {
  const hints = []
  const seen = new Set()
  for (const item of items) {
    if (!item) continue
    const entityId = String(item.entity_id || item.entityId || item.id || item.value || '').trim()
    if (!entityId.includes('.')) continue
    const domain = String(item.domain || entityId.split('.')[0] || '')
    const areaName = String(item.areaName || item.area_name || '')
    const friendlyName = String(item.name || item.friendly_name || item.friendlyName || item.attributes?.friendly_name || '')
    const areaFriendlyName = areaName && friendlyName && !normalizeVoiceText(friendlyName).startsWith(normalizeVoiceText(areaName))
      ? `${areaName} ${friendlyName}`
      : ''
    const names = new Set([
      friendlyName,
      item.name,
      item.friendly_name,
      item.friendlyName,
      item.label,
      item.text,
      areaFriendlyName,
      areaName && item.deviceType ? `${areaName} ${item.deviceType}` : '',
      entityId.split('.').slice(1).join('.').replace(/_/g, ' '),
    ].filter(Boolean).map(String))
    for (const name of Array.from(names)) {
      const stripped = stripVoiceEntitySuffixes(name)
      if (stripped && stripped !== normalizeVoiceText(name)) names.add(stripped)
    }
    for (const name of names) {
      const key = `${entityId}:${normalizeVoiceText(name)}`
      if (seen.has(key)) continue
      seen.add(key)
      hints.push({
        entityId,
        domain,
        name,
        deviceClass: item.attributes?.device_class || item.device_class || '',
        deviceType: item.deviceType || '',
        state: item.state || '',
        valueOptions: Array.isArray(item.valueOptions) ? item.valueOptions : [],
      })
    }
  }
  return hints
}

function waitForNotificationAction(actionIds, timeoutSeconds, signal, sendNotification) {
  throwIfCancelled(signal)
  const expectedActions = new Set(actionIds)
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeout)
      notificationActionWaiters = notificationActionWaiters.filter((waiter) => waiter !== waiterEntry)
      signal?.removeEventListener('abort', onAbort)
    }
    const onAbort = () => {
      cleanup()
      reject(createCancelledError())
    }
    const timeout = setTimeout(() => {
      cleanup()
      resolve(null)
    }, timeoutSeconds * 1000)
    const waiterEntry = {
      expectedActions,
      resolve: (response) => {
        cleanup()
        resolve(response)
      },
    }

    signal?.addEventListener('abort', onAbort, { once: true })
    notificationActionWaiters.push(waiterEntry)
    Promise.resolve(sendNotification()).catch((error) => {
      cleanup()
      reject(error)
    })
  })
}

function resolveNotificationActionWaiters(eventData) {
  const action = String(eventData.action ?? '')
  if (!action) return
  const matching = notificationActionWaiters.filter((waiter) => waiter.expectedActions.has(action))
  notificationActionWaiters = notificationActionWaiters.filter((waiter) => !matching.includes(waiter))
  matching.forEach((waiter) => waiter.resolve({
    action,
    replyText: eventData.reply_text,
  }))
}

function applyNotifyActions(data, notifyData, context = {}, actionToken = '') {
  const actions = (Array.isArray(data.notifyActions) ? data.notifyActions : [])
    .slice(0, 3)
    .map((action, index) => ({ action, index }))
    .filter(({ action }) => String(action?.title ?? '').trim())
    .map(({ action, index }) => {
      const configuredAction = String(action.action ?? '').trim() || notificationActionId(action.title)
      const isUri = configuredAction === 'URI'
      const generatedAction = actionToken && !isUri ? `${configuredAction}_${actionToken}` : configuredAction
      const result = {
        title: renderRunMessage(String(action.title).trim(), context),
        action: generatedAction,
        sourceHandle: `action-${index}`,
        waitForResponse: !isUri,
      }
      if (String(action.uri ?? '').trim()) result.uri = renderRunMessage(String(action.uri).trim(), context)
      if (configuredAction === 'REPLY') result.behavior = 'textInput'
      return result
    })
  if (actions.length) {
    notifyData.actions = actions.map((action) => {
      const payloadAction = { title: action.title, action: action.action }
      if (action.uri) payloadAction.uri = action.uri
      if (action.behavior) payloadAction.behavior = action.behavior
      return payloadAction
    })
  }
  return actions
}

function notificationActionId(title) {
  const normalized = String(title ?? '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return normalized || 'BUTTON'
}

function withResolvedVoiceEntity(item, entityHints, preferredDomains = []) {
  const match = resolveVoiceEntityHint(item.label, entityHints, preferredDomains)
  if (!match) return item
  const resolvedState = item.requestedState ? voiceStateForResolvedEntity(item.requestedState, match) : item.state
  return {
    ...item,
    ...(resolvedState ? { state: resolvedState } : {}),
    ...(match.confident ? { entityId: match.entityId, domain: match.domain || item.domain } : {}),
    ...(match.suggestions.length ? { entitySuggestions: match.suggestions } : {}),
  }
}

function resolveVoiceEntityHint(label, entityHints = [], preferredDomains = []) {
  const normalizedLabel = normalizeVoiceText(label)
  if (!normalizedLabel) return null
  const allowedDomains = new Set(preferredDomains.filter(Boolean))
  const matches = entityHints
    .map((hint) => {
      const entityId = String(hint.entityId || hint.entity_id || '')
      const name = String(hint.name || hint.friendlyName || hint.friendly_name || '')
      const domain = String(hint.domain || entityId.split('.')[0] || '')
      const hintDeviceText = normalizeVoiceText([hint.deviceClass, hint.deviceType].filter(Boolean).join(' '))
      const normalizedName = normalizeVoiceText(name)
      const normalizedEntity = normalizeVoiceText(entityId.split('.').slice(1).join(' ').replace(/_/g, ' '))
      const normalizedSearchName = normalizeVoiceText([normalizedName, normalizedEntity, hintDeviceText].filter(Boolean).join(' '))
      const exact = normalizedName === normalizedLabel || normalizedEntity === normalizedLabel
      const contains = normalizedName.includes(normalizedLabel) || normalizedLabel.includes(normalizedName) || normalizedEntity.includes(normalizedLabel)
      const nameCoverage = voiceTextSimilarity(normalizedLabel, normalizedName)
      const entityCoverage = voiceTextSimilarity(normalizedLabel, normalizedEntity)
      const searchCoverage = voiceTextSimilarity(normalizedLabel, normalizedSearchName)
      const matchCoverage = Math.max(nameCoverage, entityCoverage, searchCoverage)
      const close = nameCoverage >= 0.45 || entityCoverage >= 0.45 || searchCoverage >= 0.72
      if (!entityId || (!exact && !contains && !close)) return null
      const specificContains = contains && voiceHasSpecificEntityName(normalizedName) && Math.max(nameCoverage, entityCoverage) >= 0.5
      const domainScore = !allowedDomains.size || allowedDomains.has(domain) ? 20 : 0
      const exactScore = exact ? 40 : 0
      const containsScore = contains ? 24 : 0
      const closeScore = close ? Math.round(matchCoverage * 18) : 0
      const lengthScore = Math.max(0, 20 - Math.abs(normalizedName.length - normalizedLabel.length))
      return {
        entityId,
        domain,
        name,
        deviceClass: hint.deviceClass || '',
        deviceType: hint.deviceType || '',
        state: hint.state || '',
        valueOptions: hint.valueOptions || [],
        matchCoverage,
        confident: exact || (specificContains && domainScore > 0),
        score: domainScore + exactScore + containsScore + closeScore + lengthScore,
      }
    })
    .filter(Boolean)
    .sort((first, second) => second.score - first.score || first.entityId.localeCompare(second.entityId))
  if (!matches.length) return null
  const suggestions = Array.from(new Map(matches.map(({ entityId, domain, name }) => [entityId, { entityId, domain, name }])).values()).slice(0, 5)
  const preferredMatches = allowedDomains.size ? matches.filter((match) => allowedDomains.has(match.domain)) : matches
  const uniquePreferredEntityIds = new Set(preferredMatches.map((match) => match.entityId))
  const best = matches[0]
  const strongSingleMatch = uniquePreferredEntityIds.size === 1 && best.score >= 55 && best.matchCoverage >= 0.72
  return { ...best, confident: best.confident || strongSingleMatch, suggestions }
}

function getVoiceConditionDomains(state) {
  if (['locked', 'unlocked'].includes(state)) return ['lock']
  return ['binary_sensor', 'input_boolean', 'switch', 'sensor', 'cover', 'lock', 'person', 'device_tracker']
}

function voiceTextSimilarity(firstValue, secondValue) {
  const firstTokens = normalizeVoiceMatchTokens(firstValue)
  const secondTokens = normalizeVoiceMatchTokens(secondValue)
  if (!firstTokens.length || !secondTokens.length) return 0
  const matchedSecondIndexes = new Set()
  let score = 0
  for (const firstToken of firstTokens) {
    const matchIndex = secondTokens.findIndex((secondToken, index) => !matchedSecondIndexes.has(index) && voiceTokensMatch(firstToken, secondToken))
    if (matchIndex >= 0) {
      matchedSecondIndexes.add(matchIndex)
      score += firstToken === secondTokens[matchIndex] ? 1 : 0.72
    }
  }
  return score / Math.max(firstTokens.length, secondTokens.length)
}

function voiceStateForResolvedEntity(requestedState, match) {
  const requested = normalizeVoiceText(requestedState)
  const options = new Set([match.state, ...(match.valueOptions || [])].filter(Boolean).map((value) => normalizeVoiceText(value)))
  if (options.has(requested)) return requested
  if (match.domain === 'binary_sensor') {
    if (['open', 'opened', 'detected', 'occupied', 'home', 'locked', 'on'].includes(requested)) return 'on'
    if (['closed', 'clear', 'cleared', 'unoccupied', 'away', 'unlocked', 'off'].includes(requested)) return 'off'
  }
  if (match.domain === 'cover') {
    if (['open', 'opened'].includes(requested)) return 'open'
    if (requested === 'closed') return 'closed'
  }
  if (match.domain === 'lock' && ['locked', 'unlocked'].includes(requested)) return requested
  if (['person', 'device_tracker'].includes(match.domain)) {
    if (requested === 'home') return 'home'
    if (requested === 'away') return 'not_home'
  }
  if (['light', 'switch', 'fan', 'input_boolean', 'humidifier'].includes(match.domain)) {
    if (['on', 'open', 'opened', 'detected', 'occupied'].includes(requested)) return 'on'
    if (['off', 'closed', 'clear', 'cleared', 'unoccupied'].includes(requested)) return 'off'
  }
  return voiceState(requested)
}

function normalizeVoiceMatchTokens(value) {
  const aliases = {
    bath: 'bathroom',
    br: 'bedroom',
    dim: 'dimmer',
    dr: 'door',
    kit: 'kitchen',
    lr: 'living room',
    rm: 'room',
    tv: 'television',
  }
  return normalizeVoiceText(value)
    .split(' ')
    .flatMap((token) => (aliases[token] || token).split(' '))
    .filter((token) => token.length > 1)
}

function voiceTokensMatch(firstToken, secondToken) {
  if (firstToken === secondToken) return true
  if (firstToken.length >= 3 && secondToken.startsWith(firstToken)) return true
  if (secondToken.length >= 3 && firstToken.startsWith(secondToken)) return true
  return false
}

function stripVoiceEntitySuffixes(value) {
  return normalizeVoiceText(value)
    .replace(/\b(?:binary sensor|contact sensor|contact|sensor|opening sensor|door sensor|window sensor|motion sensor|light entity|switch entity)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function voiceHasSpecificEntityName(value) {
  const generic = new Set(['lamp', 'light', 'switch', 'sensor', 'door', 'fan', 'helper'])
  const tokens = normalizeVoiceMatchTokens(value).filter((token) => !generic.has(token))
  return tokens.length > 0 || normalizeVoiceMatchTokens(value).length >= 2
}

function buildVoiceRecipeFlow(description, { entityHints = [] } = {}) {
  const text = String(description || '').trim()
  const sections = splitVoiceElseSections(text)
  const conditions = parseVoiceConditions(sections.primary).map((condition) => withResolvedVoiceEntity(condition, entityHints, getVoiceConditionDomains(condition.state)))
  const actions = parseVoiceActions(sections.primary).map((action) => withResolvedVoiceEntity(action, entityHints, [action.domain]))
  const elseActions = sections.otherwise ? parseVoiceActions(sections.otherwise).map((action) => withResolvedVoiceEntity(action, entityHints, [action.domain])) : []
  const schedule = parseVoiceSchedule(text)
  const delaySeconds = parseVoiceDelay(sections.primary)
  const waitUntil = parseVoiceWaitUntil(sections.primary)

  if (!conditions.length && !schedule) throw new Error('Say when the flow should start, like "when bathroom door closes".')
  if (!actions.length && !elseActions.length && !waitUntil) throw new Error('Say what the flow should do, like "turn on vanity lights".')

  const nodes = []
  const edges = []
  const prefix = `voice-recipe-${crypto.randomUUID().slice(0, 8)}`
  const addNode = (kind, label, x, data = {}) => {
    const id = `${prefix}-${kind}-${nodes.length + 1}`
    nodes.push({ id, type: 'haflow', position: { x, y: 120 }, data: { kind, label, ...data } })
    return id
  }
  const connect = (source, target, sourceHandle) => edges.push({ id: `${source}-${target}`, source, sourceHandle, target, animated: true })

  let x = 80
  let previousId = ''
  let lastConditionId = ''
  const [triggerCondition, ...extraConditions] = conditions
  if (triggerCondition) {
    previousId = addNode('state', `${triggerCondition.label} ${voiceTitle(triggerCondition.stateLabel)}`, x, {
      entityId: '',
      from: oppositeVoiceState(triggerCondition.state),
      to: triggerCondition.state,
      ...(triggerCondition.entityId ? { entityId: triggerCondition.entityId } : {}),
      ...(triggerCondition.entitySuggestions ? { entitySuggestions: triggerCondition.entitySuggestions } : {}),
      triggers: [{ id: `${prefix}-trigger-rule`, entityId: triggerCondition.entityId || '', from: oppositeVoiceState(triggerCondition.state), to: triggerCondition.state }],
    })
    x += 300
  }

  if (schedule) {
    const scheduleId = addNode('time', schedule.label, x, schedule.data)
    if (previousId) connect(previousId, scheduleId)
    previousId = scheduleId
    x += 300
  }

  for (const condition of extraConditions) {
    const conditionId = addNode('condition', `${condition.label} Is ${voiceTitle(condition.stateLabel)}`, x, {
      conditionMode: 'all',
      entityId: '',
      attribute: 'state',
      operator: 'equals',
      value: condition.state,
      conditions: [{ id: `${prefix}-condition-${nodes.length + 1}`, entityId: condition.entityId || '', attribute: 'state', operator: 'equals', value: condition.state }],
      ...(condition.entityId ? { entityId: condition.entityId } : {}),
      ...(condition.entitySuggestions ? { entitySuggestions: condition.entitySuggestions } : {}),
    })
    if (previousId) connect(previousId, conditionId)
    previousId = conditionId
    lastConditionId = conditionId
    x += 300
  }

  if (delaySeconds && actions.length <= 1) {
    const delayId = addNode('delay', `Wait ${formatVoiceDuration(delaySeconds)}`, x, { seconds: delaySeconds })
    if (previousId) connect(previousId, delayId)
    previousId = delayId
    x += 300
  }

  if (waitUntil) {
    const waitId = addNode('wait', waitUntil.label, x, waitUntil.data)
    if (previousId) connect(previousId, waitId)
    previousId = waitId
    x += 300
  }

  actions.forEach((action, index) => {
    const actionX = x + (index * 300) + (delaySeconds && actions.length > 1 && index > 0 ? 300 : 0)
    const actionId = addNode('service', `${voiceTitle(action.service)} ${action.label}`, actionX, {
      domain: action.domain,
      service: action.service,
      entityId: action.entityId || '',
      entityIds: action.entityId ? [action.entityId] : [],
      ...(action.entitySuggestions ? { entitySuggestions: action.entitySuggestions } : {}),
      payload: action.payload,
    })
    if (previousId) connect(previousId, actionId, previousId.includes('condition') ? 'true' : undefined)
    previousId = actionId
    if (delaySeconds && actions.length > 1 && index === 0) {
      const delayId = addNode('delay', `Wait ${formatVoiceDuration(delaySeconds)}`, actionX + 300, { seconds: delaySeconds })
      connect(previousId, delayId)
      previousId = delayId
    }
  })
  if (actions.length) x += (actions.length + (delaySeconds && actions.length > 1 ? 1 : 0)) * 300

  elseActions.forEach((action, index) => {
    const actionId = addNode('service', `Otherwise ${voiceTitle(action.service)} ${action.label}`, x + (index * 300), {
      domain: action.domain,
      service: action.service,
      entityId: action.entityId || '',
      entityIds: action.entityId ? [action.entityId] : [],
      ...(action.entitySuggestions ? { entitySuggestions: action.entitySuggestions } : {}),
      payload: action.payload,
    })
    if (lastConditionId) connect(lastConditionId, actionId, 'false')
  })

  return {
    flowName: voiceFlowName(text),
    nodes,
    edges,
    viewport: { x: 0, y: 0, zoom: 0.85 },
    summary: [
      triggerCondition ? `Trigger: ${triggerCondition.label} ${triggerCondition.stateLabel}` : '',
      schedule ? `Schedule: ${schedule.label}` : '',
      ...extraConditions.map((condition) => `Condition: ${condition.label} ${condition.stateLabel}`),
      delaySeconds ? `Delay: ${formatVoiceDuration(delaySeconds)}` : '',
      waitUntil ? `Wait: ${waitUntil.summary}` : '',
      ...actions.map((action) => `Action: ${voiceTitle(action.service)} ${action.label}`),
      ...elseActions.map((action) => `Otherwise: ${voiceTitle(action.service)} ${action.label}`),
    ].filter(Boolean),
  }
}

function splitVoiceElseSections(text) {
  const match = String(text || '').match(/\b(?:otherwise|else|if not|if false)\b/i)
  if (!match) return { primary: text, otherwise: '' }
  return {
    primary: text.slice(0, match.index).trim(),
    otherwise: text.slice((match.index ?? 0) + match[0].length).trim(),
  }
}

function parseVoiceConditions(text) {
  const normalized = normalizeVoiceText(text)
  const conditions = []
  const addCondition = (phrase, stateValue) => {
    const label = voiceTitle(cleanVoiceTarget(phrase))
    const state = voiceState(stateValue)
    if (!label) return
    if (conditions.some((item) => item.label === label && item.state === state)) return
    conditions.push({ label, state, requestedState: normalizeVoiceText(stateValue), stateLabel: voiceStateLabel(stateValue) })
  }

  for (const match of normalized.matchAll(/\b(?:if|when|while|only if|provided|and|or|with)\s+(.+?)\s+(?:is|are|becomes|become|gets|get)\s+(open|opened|closed|on|off|detected|clear|cleared|occupied|unoccupied|home|away|locked|unlocked)\b/g)) {
    addCondition(match[1], match[2])
  }
  for (const match of normalized.matchAll(/\b(?:if|when|while|only if|provided|and|or|with)\s+(.+?)\s+(opens|closes|turns on|turns off|detects|clears|locks|unlocks)\b/g)) {
    addCondition(match[1], voiceVerbState(match[2]))
  }
  for (const match of normalized.matchAll(/\b(?:if|when|while|only if|provided)\s+(.+?)\s+(open|opened|closed|detected|clear|cleared|occupied|unoccupied|locked|unlocked)\b/g)) {
    addCondition(match[1], match[2])
  }
  return conditions
}

function parseVoiceActions(text) {
  const normalized = normalizeVoiceText(text)
  const payload = buildVoiceActionPayload(normalized)
  const actions = []
  let lastTarget = ''
  const addAction = (domain, service, target, actionPayload = payload) => {
    let cleanTarget = cleanVoiceActionTarget(target)
    if (isVoicePronoun(cleanTarget)) cleanTarget = lastTarget
    if (!cleanTarget) return
    lastTarget = cleanTarget
    actions.push({ domain, service, label: voiceTitle(cleanTarget), payload: actionPayload })
  }

  for (const match of normalized.matchAll(/\b(?:turn|switch)\s+(on|off)\s+(.+?)(?=\s+\b(?:but|only|if|when|while|between|after|before|provided|then|otherwise|else)\b|[,.]|$)/g)) {
    const target = cleanVoiceActionTarget(match[2])
    addAction(inferVoiceDomain(target), match[1] === 'on' ? 'turn_on' : 'turn_off', target)
  }
  for (const match of normalized.matchAll(/\bcall\s+([a-z0-9_]+)\.([a-z0-9_]+)(?:\s+(?:on|for)\s+(.+?))?(?=\s+\b(?:but|only|if|when|while|between|after|before|provided|then|otherwise|else)\b|[,.]|$)/g)) {
    addAction(match[1], match[2], match[3] || `${match[1]} ${match[2]}`)
  }
  for (const match of normalized.matchAll(/\b(open|close|lock|unlock)\s+(.+?)(?=\s+\b(?:but|only|if|when|while|between|after|before|provided|then|otherwise|else)\b|[,.]|$)/g)) {
    const target = cleanVoiceActionTarget(match[2])
    const domain = ['lock', 'unlock'].includes(match[1]) ? 'lock' : /\b(?:garage|cover|blind|shade|curtain|door|gate|window)\b/.test(target) ? 'cover' : inferVoiceDomain(target)
    const service = domain === 'lock'
      ? match[1] === 'unlock' ? 'unlock' : 'lock'
      : domain === 'cover'
        ? match[1] === 'close' ? 'close_cover' : 'open_cover'
        : ['close', 'lock'].includes(match[1]) ? 'turn_off' : 'turn_on'
    addAction(domain, service, target)
  }
  for (const match of normalized.matchAll(/\bset\s+(.+?)\s+to\s+(.+?)(?=\s+\b(?:but|only|if|when|while|between|after|before|provided|then|otherwise|else)\b|[,.]|$)/g)) {
    const target = cleanVoiceActionTarget(match[1])
    const value = normalizeVoiceText(match[2])
    if (/\b(?:thermostat|temperature|climate|heat|ac|air conditioner)\b/.test(target)) {
      const temperature = value.match(/\b(\d{2,3})(?:\s*degrees?)?\b/)
      addAction('climate', 'set_temperature', target, temperature ? JSON.stringify({ temperature: Number(temperature[1]) }, null, 2) : '{}')
    } else if (/\bfan\b/.test(target)) {
      const percentage = value.match(/\b(\d{1,3})\s*(?:percent|pct|%)?\b/)
      addAction('fan', 'set_percentage', target, percentage ? JSON.stringify({ percentage: Math.max(0, Math.min(100, Number(percentage[1]))) }, null, 2) : '{}')
    } else {
      addAction(inferVoiceDomain(target), 'turn_on', target, buildVoiceActionPayload(`${target} ${value}`))
    }
  }

  const seen = new Set()
  return actions.filter((action) => {
    const key = `${action.domain}.${action.service}:${action.label}:${action.payload}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function parseVoiceSchedule(text) {
  const normalized = normalizeVoiceText(text)
  const days = parseVoiceDays(normalized)
  const between = normalized.match(/\bbetween\s+(sunset|sunrise|\d{1,2}:\d{2}\s*(?:am|pm)?|\d{1,2}\s*(?:am|pm))\s+and\s+(sunset|sunrise|\d{1,2}:\d{2}\s*(?:am|pm)?|\d{1,2}\s*(?:am|pm))\b/)
  if (between) {
    const start = voiceSchedulePoint(between[1])
    const end = voiceSchedulePoint(between[2])
    return {
      label: `Between ${start.label} And ${end.label}${voiceDaySuffix(days)}`,
      data: { scheduleMode: 'between', startType: start.type, startTime: start.time, endType: end.type, endTime: end.time, days },
    }
  }
  if (/\b(?:at night|overnight|after sunset|before sunrise|sunset to sunrise)\b/.test(normalized)) {
    return {
      label: `Between Sunset And Sunrise${voiceDaySuffix(days)}`,
      data: { scheduleMode: 'between', startType: 'sunset', startTime: '19:00', endType: 'sunrise', endTime: '07:00', days },
    }
  }
  const atTime = normalized.match(/\bat\s+(sunrise|sunset|\d{1,2}:\d{2}\s*(?:am|pm)?|\d{1,2}\s*(?:am|pm))\b/)
  if (!atTime) return null
  const point = voiceSchedulePoint(atTime[1])
  return { label: `At ${point.label}${voiceDaySuffix(days)}`, data: { scheduleMode: 'at', atType: point.type, at: point.time, days } }
}

function parseVoiceDelay(text) {
  const match = normalizeVoiceNumbers(text).match(/\b(?:delay|pause|wait|after|for)\s+(\d+)\s+(second|seconds|minute|minutes|hour|hours)\b/)
  return match ? voiceDurationSeconds(match[1], match[2]) : 0
}

function parseVoiceWaitUntil(text) {
  const normalized = normalizeVoiceNumbers(text)
  const match = normalized.match(/\bwait\s+until\s+(.+?)\s+(?:is|are|becomes|become|gets|get)\s+(open|opened|closed|on|off|detected|clear|cleared|occupied|unoccupied|home|away|locked|unlocked)\b/)
  if (!match) return null
  const label = voiceTitle(cleanVoiceTarget(match[1]))
  const state = voiceState(match[2])
  const timeout = voiceTimeoutSeconds(normalized) || 300
  return {
    label: `Wait Until ${label} Is ${voiceTitle(voiceStateLabel(match[2]))}`,
    data: { entityId: '', attribute: 'state', to: state, timeoutSeconds: timeout },
    summary: `${label} is ${voiceStateLabel(match[2])} for up to ${formatVoiceDuration(timeout)}`,
  }
}

function voiceState(value) {
  const normalized = normalizeVoiceText(value)
  return {
    open: 'on',
    opened: 'on',
    closed: 'off',
    detected: 'on',
    clear: 'off',
    cleared: 'off',
    occupied: 'on',
    unoccupied: 'off',
    away: 'not_home',
    on: 'on',
    off: 'off',
    home: 'home',
    locked: 'locked',
    unlocked: 'unlocked',
  }[normalized] || normalized
}

function voiceStateLabel(value) {
  const normalized = normalizeVoiceText(value)
  return { opened: 'open', opens: 'open', closes: 'closed', detects: 'detected', clears: 'clear', locks: 'locked', unlocks: 'unlocked', 'turns on': 'on', 'turns off': 'off' }[normalized] || normalized
}

function voiceVerbState(value) {
  return voiceStateLabel(value)
}

function oppositeVoiceState(state) {
  return { on: 'off', off: 'on', open: 'closed', closed: 'open', locked: 'unlocked', unlocked: 'locked', home: 'not_home', not_home: 'home' }[state] || ''
}

function cleanVoiceTarget(value) {
  return normalizeVoiceText(value)
    .replace(/\b(?:the|a|an|my|our|that|this|to|from|then|and|or|is|are|becomes|become|gets|get)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanVoiceActionTarget(value) {
  return cleanVoiceTarget(value)
    .replace(/\b(?:at|brightness|bright|dimmed?|color|colour|temperature|kelvin|percent|pct|rgb)\b.*$/g, ' ')
    .replace(/\b\d{1,3}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isVoicePronoun(value) {
  return /^(?:it|them|that|this|same one|same thing)$/.test(normalizeVoiceText(value))
}

function voiceTitle(value) {
  return cleanVoiceTarget(value).split(' ').filter(Boolean).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

function voiceFlowName(text) {
  const words = normalizeVoiceText(text).split(' ').filter(Boolean).slice(0, 7)
  return words.length ? words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') : 'Voice Recipe'
}

function parseVoiceDays(normalized) {
  if (/\b(?:weekday|weekdays|workday|workdays|monday through friday|mon through fri|monday to friday|mon to fri)\b/.test(normalized)) return [1, 2, 3, 4, 5]
  if (/\b(?:weekend|weekends|saturday and sunday|sat and sun)\b/.test(normalized)) return [0, 6]
  const dayMap = new Map([
    ['sunday', 0], ['sun', 0],
    ['monday', 1], ['mon', 1],
    ['tuesday', 2], ['tue', 2], ['tues', 2],
    ['wednesday', 3], ['wed', 3],
    ['thursday', 4], ['thu', 4], ['thur', 4], ['thurs', 4],
    ['friday', 5], ['fri', 5],
    ['saturday', 6], ['sat', 6],
  ])
  const selected = []
  for (const [name, value] of dayMap) {
    if (new RegExp(`\\b${name}\\b`).test(normalized)) selected.push(value)
  }
  return Array.from(new Set(selected)).sort((first, second) => first - second)
}

function voiceDaySuffix(days) {
  if (!Array.isArray(days) || !days.length || days.length === 7) return ''
  const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return ` On ${days.map((day) => labels[day]).join(', ')}`
}

function voiceSchedulePoint(value) {
  const normalized = normalizeVoiceText(value)
  if (normalized === 'sunrise' || normalized === 'sunset') return { type: normalized, time: normalized === 'sunset' ? '19:00' : '07:00', label: voiceTitle(normalized) }
  const time = normalizeVoiceTime(normalized) || '07:00'
  return { type: 'time', time, label: time }
}

function buildVoiceActionPayload(normalized) {
  const payload = {}
  const brightness = normalized.match(/\b(?:brightness|bright|dimmed?|at)\s+(?:to\s+)?(\d{1,3})\s*(?:percent|pct|%)\b/)
  if (brightness) payload.brightness_pct = Math.max(0, Math.min(100, Number(brightness[1])))
  const kelvin = normalized.match(/\b(?:color temperature|temperature|kelvin)\s+(?:to\s+)?(\d{3,5})\s*(?:k|kelvin)?\b/)
  if (kelvin) payload.color_temp_kelvin = Number(kelvin[1])
  const color = parseVoiceColor(normalized)
  if (color) payload.rgb_color = color
  return Object.keys(payload).length ? JSON.stringify(payload, null, 2) : '{}'
}

function parseVoiceColor(normalized) {
  const colorMap = {
    red: [255, 0, 0],
    green: [0, 128, 0],
    blue: [0, 0, 255],
    purple: [128, 0, 128],
    pink: [255, 105, 180],
    orange: [255, 165, 0],
    yellow: [255, 255, 0],
    white: [255, 255, 255],
    warm: [255, 214, 170],
    cool: [180, 220, 255],
  }
  const hex = normalized.match(/#([0-9a-f]{6})\b/)
  if (hex) return [0, 2, 4].map((index) => parseInt(hex[1].slice(index, index + 2), 16))
  const rgb = normalized.match(/\brgb\s*(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})\b/)
  if (rgb) return [1, 2, 3].map((index) => Math.max(0, Math.min(255, Number(rgb[index]))))
  const colorMatch = normalized.match(/\b(?:color|colour)\s+(?:to\s+)?([a-z]+)\b/)
  const colorName = colorMatch?.[1] || Object.keys(colorMap).find((name) => new RegExp(`\\b${name}\\b`).test(normalized))
  return colorName ? colorMap[colorName] : null
}

function inferVoiceDomain(value) {
  const normalized = normalizeVoiceText(value)
  if (/\b(?:thermostat|climate|heat|ac|air conditioner)\b/.test(normalized)) return 'climate'
  if (/\b(?:garage|cover|blind|blinds|shade|shades|curtain|curtains)\b/.test(normalized)) return 'cover'
  if (/\b(?:lock|deadbolt)\b/.test(normalized)) return 'lock'
  if (/\bfan\b/.test(normalized)) return 'fan'
  if (/\b(?:helper|boolean|input boolean)\b/.test(normalized)) return 'input_boolean'
  if (/\bswitch\b/.test(normalized)) return 'switch'
  return 'light'
}

function formatVoiceDuration(seconds) {
  if (seconds >= 3600 && seconds % 3600 === 0) return `${seconds / 3600} hour${seconds === 3600 ? '' : 's'}`
  if (seconds >= 60 && seconds % 60 === 0) return `${seconds / 60} minute${seconds === 60 ? '' : 's'}`
  return `${seconds} second${seconds === 1 ? '' : 's'}`
}

function voiceTimeoutSeconds(value) {
  const normalized = normalizeVoiceNumbers(value)
  const match = normalized.match(/\b(?:timeout|time out|give up|stop waiting)\s+(?:after|in)?\s*(\d+)\s*(second|seconds|minute|minutes|hour|hours)\b/)
    || normalized.match(/\bfor up to\s+(\d+)\s*(second|seconds|minute|minutes|hour|hours)\b/)
  return match ? voiceDurationSeconds(match[1], match[2]) : 0
}

function voiceDurationSeconds(amountValue, unit) {
  const amount = Number(amountValue)
  if (String(unit).startsWith('hour')) return amount * 3600
  if (String(unit).startsWith('minute')) return amount * 60
  return amount
}

function normalizeVoiceTime(value) {
  const match = String(value || '').trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/)
  if (!match) return ''
  let hours = Number(match[1])
  const minutes = Number(match[2] || 0)
  if (match[3] === 'pm' && hours < 12) hours += 12
  if (match[3] === 'am' && hours === 12) hours = 0
  if (hours > 23 || minutes > 59) return ''
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function normalizeVoiceText(value) {
  return String(value || '').toLowerCase().replace(/[_-]/g, ' ').replace(/[^\w\s:#%]/g, ' ').replace(/\s+/g, ' ').trim()
}

function normalizeVoiceNumbers(value) {
  const numberWords = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
    twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, ninety: 90,
  }
  return normalizeVoiceText(value).replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|ninety)\b/g, (word) => String(numberWords[word]))
}

function broadcast(payload) {
  const message = JSON.stringify(payload)
  for (const client of clients) {
    if (client.readyState === client.OPEN) client.send(message)
  }
}

async function initializeFlowLibrary() {
  const index = await readJson(flowIndexPath, null)
  if (Array.isArray(index) && index.length) return

  const legacyFlow = await readJson(legacyFlowPath, cachedFlow)
  await writeJson(getFlowPath('default'), legacyFlow)
  await writeFlowIndex([
    {
      id: 'default',
      name: 'Default Flow',
      createdAt: new Date().toISOString(),
    },
  ])
  config = { ...config, activeFlowId: config.activeFlowId ?? 'default' }
  await writeJson(configPath, config)
}

async function readFlowIndex() {
  const flows = await readJson(flowIndexPath, [])
  const normalized = flows.map(normalizeFlowMeta)
  return normalized.length ? normalized : [normalizeFlowMeta({ id: 'default', name: 'Default Flow', createdAt: new Date().toISOString() })]
}

async function writeFlowIndex(flows) {
  await writeJson(flowIndexPath, flows.map(normalizeFlowMeta))
  invalidateRunnableFlowCache()
}

async function readFlow(flowId) {
  const flowPath = getFlowPath(flowId)
  const flow = await readJson(flowPath, { nodes: [], edges: [] })
  const normalized = normalizeFlow(flow)
  if (JSON.stringify(flow) !== JSON.stringify(normalized)) await writeJson(flowPath, normalized)
  return normalized
}

async function readFlowMeta(flowId) {
  const flows = await readFlowIndex()
  return flows.find((flow) => flow.id === flowId) ?? normalizeFlowMeta({ id: flowId || 'default', name: flowId || 'Default Flow' })
}

async function getRunnableFlowEntries() {
  if (runnableFlowCache) return runnableFlowCache
  const flows = await readFlowIndex()
  runnableFlowCache = await Promise.all(flows
    .filter((meta) => !meta.paused)
    .map(async (meta) => ({
      meta,
      flow: meta.id === (config.activeFlowId ?? 'default') ? cachedFlow : await readFlow(meta.id),
    })))
  return runnableFlowCache
}

async function isActiveFlowPaused() {
  cachedFlowMeta = await readFlowMeta(config.activeFlowId ?? 'default')
  return Boolean(cachedFlowMeta.paused)
}

async function writeFlow(flowId, flow) {
  await writeJson(getFlowPath(flowId), normalizeFlow(flow))
  invalidateRunnableFlowCache()
}

function invalidateRunnableFlowCache() {
  runnableFlowCache = null
}

async function getStarterPackFlows() {
  const simpleMotion = await readJson(path.join(examplesDir, 'simple-motion-light.json'), createSimpleMotionFlow())
  const pico2 = await readJson(path.join(examplesDir, '2-button-pico-example.json'), createTwoButtonPicoFlow())
  const pico = await readJson(path.join(examplesDir, '5-button-pico-example.json'), createFiveButtonPicoFlow())
  return [
    { name: 'Starter - Simple Motion Light', flow: simpleMotion },
    { name: 'Starter - 2 Button Pico Controller', flow: pico2 },
    { name: 'Starter - 5 Button Pico Controller', flow: pico },
    { name: 'Starter - Contact Sensor Notification', flow: createContactNotificationFlow() },
    { name: 'Starter - Scheduled Evening Scene', flow: createScheduledSceneFlow() },
  ]
}

function createSimpleMotionFlow() {
  return {
    nodes: [
      { id: 'starter-motion-trigger', type: 'haflow', position: { x: 80, y: 90 }, data: { kind: 'state', label: 'Motion Detected', entityId: 'binary_sensor.example_motion', from: 'off', to: 'on' } },
      { id: 'starter-motion-action', type: 'haflow', position: { x: 380, y: 90 }, data: { kind: 'service', label: 'Turn Light On', domain: 'light', service: 'turn_on', entityId: 'light.example_light', entityIds: ['light.example_light'], payload: '{\n  "brightness_pct": 65\n}' } },
    ],
    edges: [{ id: 'starter-motion-edge', source: 'starter-motion-trigger', target: 'starter-motion-action', animated: true }],
    viewport: { x: 0, y: 0, zoom: 1 },
  }
}

function createFiveButtonPicoFlow() {
  return { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }
}

function createTwoButtonPicoFlow() {
  return { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }
}

function createContactNotificationFlow() {
  return {
    nodes: [
      { id: 'starter-door-open', type: 'haflow', position: { x: 80, y: 100 }, data: { kind: 'state', label: 'Door Opened', entityId: 'binary_sensor.example_door', from: 'off', to: 'on', triggers: [{ id: 'starter-door-rule', entityId: 'binary_sensor.example_door', deviceId: '', deviceIdentifiers: [], from: 'off', to: 'on' }] } },
      { id: 'starter-door-notify', type: 'haflow', position: { x: 390, y: 100 }, data: { kind: 'service', label: 'Send Notification', domain: 'persistent_notification', service: 'create', entityIds: [], entityId: '', payload: '{\n  "message": "The example door was opened.",\n  "title": "HAFlow"\n}' } },
    ],
    edges: [{ id: 'starter-door-edge', source: 'starter-door-open', target: 'starter-door-notify', animated: true }],
    viewport: { x: 0, y: 0, zoom: 1 },
  }
}

function createScheduledSceneFlow() {
  return {
    nodes: [
      { id: 'starter-evening-time', type: 'haflow', position: { x: 80, y: 100 }, data: { kind: 'time', label: 'Every Evening', scheduleMode: 'at', atType: 'time', at: '19:00', days: [] } },
      { id: 'starter-evening-scene', type: 'haflow', position: { x: 390, y: 100 }, data: { kind: 'scene', label: 'Turn On Scene', entityId: 'scene.example_evening' } },
    ],
    edges: [{ id: 'starter-evening-edge', source: 'starter-evening-time', target: 'starter-evening-scene', animated: true }],
    viewport: { x: 0, y: 0, zoom: 1 },
  }
}

function getFlowPath(flowId) {
  return path.join(flowsDir, `${safeFlowId(flowId) || 'default'}.json`)
}

function safeFlowId(flowId) {
  const value = String(flowId ?? '').trim()
  return /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(value) ? value : ''
}

function slugifyFlowId(name) {
  const slug = String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return safeFlowId(slug) || `flow-${Date.now()}`
}

function ensureUniqueFlowId(baseId, flows) {
  const existing = new Set(flows.map((flow) => flow.id))
  if (!existing.has(baseId)) return baseId
  let index = 2
  while (existing.has(`${baseId}-${index}`)) index += 1
  return `${baseId}-${index}`
}

function ensureUniqueFlowName(name, flows, currentFlowId = '') {
  const baseName = String(name || 'New Flow').trim() || 'New Flow'
  const existing = new Set(flows
    .filter((flow) => flow.id !== currentFlowId)
    .map((flow) => String(flow.name || '').trim().toLowerCase()))
  if (!existing.has(baseName.toLowerCase())) return baseName
  let index = 2
  while (existing.has(`${baseName} ${index}`.toLowerCase())) index += 1
  return `${baseName} ${index}`
}

function normalizeFlowMeta(flow) {
  return {
    id: safeFlowId(flow?.id) || 'default',
    name: String(flow?.name || 'Default Flow'),
    createdAt: flow?.createdAt || new Date().toISOString(),
    paused: Boolean(flow?.paused),
  }
}

function normalizeFlow(flow) {
  return {
    ...flow,
    nodes: Array.isArray(flow?.nodes) ? flow.nodes.map(normalizeFlowNode) : [],
    edges: Array.isArray(flow?.edges) ? flow.edges : [],
    viewport: normalizeViewport(flow?.viewport),
  }
}

function normalizeFlowNode(node) {
  const data = normalizeNodeData(node?.data ?? {}, node?.id || crypto.randomUUID())
  return { ...node, data }
}

function normalizeNodeData(data, nodeId) {
  if (data.kind === 'condition') {
    const conditions = normalizeConditionRules(data, nodeId)
    const first = conditions.find((rule) => rule.entityId) ?? conditions[0]
    return {
      ...data,
      conditionMode: data.conditionMode === 'all' ? 'all' : 'any',
      conditions,
      entityId: first?.entityId ?? '',
      attribute: first?.attribute ?? 'state',
      operator: first?.operator ?? 'equals',
      value: first?.value ?? '',
    }
  }

  if (data.kind === 'state') {
    const triggers = normalizeStateTriggerRules(data, nodeId)
    const first = triggers.find((rule) => rule.entityId || rule.deviceId) ?? triggers[0]
    return {
      ...data,
      triggers: triggers.length ? triggers : undefined,
      entityId: first?.entityId ?? data.entityId ?? '',
      deviceId: first?.deviceId ?? data.deviceId ?? '',
      from: first?.from ?? data.from ?? '',
      to: first?.to ?? data.to ?? '',
    }
  }

  if (data.kind === 'service') {
    const entityIds = Array.isArray(data.entityIds)
      ? data.entityIds.filter(Boolean).map(String)
      : data.entityId ? [String(data.entityId)] : []
    return {
      ...data,
      entityIds,
      entityId: entityIds[0] ?? data.entityId ?? '',
      payload: data.payload ?? '{}',
    }
  }

  if (data.kind === 'time') {
    const scheduleMode = data.scheduleMode === 'between' ? 'between' : 'at'
    const cleanType = (value) => SCHEDULE_TIME_TYPES.has(value) ? value : 'time'
    const days = Array.isArray(data.days)
      ? Array.from(new Set(data.days.map(Number).filter((day) => day >= 0 && day <= 6))).sort((first, second) => first - second)
      : []
    return {
      ...data,
      scheduleMode,
      atType: cleanType(data.atType),
      at: data.at || '07:00',
      startType: cleanType(data.startType),
      startTime: data.startTime || data.at || '07:00',
      endType: cleanType(data.endType),
      endTime: data.endTime || '08:00',
      days,
    }
  }

  if (data.kind === 'and') {
    return {
      ...data,
      activeStates: String(data.activeStates || 'on, active, detected, open, occupied, home'),
    }
  }

  if (data.kind === 'direction') {
    return {
      ...data,
      entityA: String(data.entityA ?? ''),
      entityB: String(data.entityB ?? ''),
      activeStates: String(data.activeStates || 'on, active, detected, open, occupied, home'),
      directionAB: String(data.directionAB || 'in'),
      directionBA: String(data.directionBA || 'out'),
      targetEntityId: String(data.targetEntityId ?? ''),
    }
  }

  if (data.kind === 'notify') {
    const target = normalizeNotifyTarget(data)
    return {
      ...data,
      target,
      notifyService: String(data.notifyService || target.replace(/^notify\./, '') || ''),
      title: String(data.title ?? ''),
      dataJson: data.dataJson ?? '{}',
      notifyActions: Array.isArray(data.notifyActions) ? data.notifyActions.slice(0, 3) : [],
      notifyTimeoutSeconds: Number.isFinite(Number(data.notifyTimeoutSeconds)) ? Math.max(1, Number(data.notifyTimeoutSeconds)) : 60,
      notifyResendCount: Number.isFinite(Number(data.notifyResendCount)) ? Math.max(0, Math.floor(Number(data.notifyResendCount))) : 0,
      pushoverPriority: data.pushoverPriority ?? '',
      pushoverSound: data.pushoverSound ?? '',
    }
  }

  if (data.kind === 'comment') {
    return {
      ...data,
      label: String(data.label || 'Comment'),
      text: String(data.text || ''),
    }
  }

  return data
}

function normalizeConditionRules(data, nodeId) {
  const sourceRules = Array.isArray(data.conditions) && data.conditions.length
    ? data.conditions
    : data.entityId
      ? [{
        entityId: data.entityId,
        attribute: data.attribute || 'state',
        operator: data.operator || 'equals',
        value: data.value ?? '',
      }]
      : []

  return sourceRules
    .filter((rule) => rule && typeof rule === 'object')
    .map((rule, index) => ({
      id: rule.id || `${nodeId}-condition-${index + 1}`,
      entityId: String(rule.entityId ?? ''),
      attribute: String(rule.attribute || 'state'),
      operator: ['equals', 'not_equals', 'contains'].includes(rule.operator) ? rule.operator : 'equals',
      value: rule.value ?? '',
    }))
}

function normalizeStateTriggerRules(data, nodeId) {
  const sourceRules = Array.isArray(data.triggers) && data.triggers.length
    ? data.triggers
    : (data.entityId || data.deviceId)
      ? [{
        entityId: data.entityId ?? '',
        deviceId: data.deviceId ?? '',
        deviceIdentifiers: data.deviceIdentifiers ?? [],
        buttonNumber: data.buttonNumber,
        from: data.from ?? '',
        to: data.to ?? '',
      }]
      : []

  return sourceRules
    .filter((rule) => rule && typeof rule === 'object')
    .map((rule, index) => ({
      id: rule.id || `${nodeId}-trigger-${index + 1}`,
      entityId: String(rule.entityId ?? ''),
      deviceId: String(rule.deviceId ?? ''),
      deviceIdentifiers: Array.isArray(rule.deviceIdentifiers) ? rule.deviceIdentifiers : [],
      buttonNumber: rule.buttonNumber,
      from: rule.from ?? '',
      to: rule.to ?? '',
    }))
}

function normalizeViewport(viewport) {
  return {
    x: Number.isFinite(viewport?.x) ? viewport.x : 0,
    y: Number.isFinite(viewport?.y) ? viewport.y : 0,
    zoom: Number.isFinite(viewport?.zoom) ? viewport.zoom : 1,
  }
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'))
  } catch {
    return fallback
  }
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`)
}
