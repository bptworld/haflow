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
let runningTriggers = new Map()
let manualRun = null
let nodeRuntime = new Map()
let runHistory = []
let activeRunEvents = new Map()
let cachedFlow = { nodes: [], edges: [] }
let cachedFlowMeta = { id: 'default', name: 'Default Flow', paused: false }
let runnableFlowCache = null
let waiters = []
let deviceRegistryById = new Map()
let entityRegistryDeviceByEntityId = new Map()
const ANY_CHANGE = '__changed__'
const LUTRON_5_BUTTON_PICO_BUTTONS = [1, 2, 5, 3, 4]

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
    : nodes.filter((node) => (incoming.get(node.id) ?? 0) === 0)

  if (!startNodes.length) throw new Error('Pick a start node or add a trigger with no incoming link.')
  log('info', `Running ${startNodes.length} start node${startNodes.length === 1 ? '' : 's'}.`)

  await Promise.all(startNodes.map((startNode) => walk(startNode, nodesById, edges, new Set(), options)))

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
  try {
    shouldContinue = options.skipStartExecution === node.id ? true : await executeNode(node, options)
    throwIfCancelled(options.signal)
  } finally {
    broadcastNodeState(shouldContinue ? 'finish' : 'stop', node, { runId: options.runId })
  }

  if (!shouldContinue && node.data?.kind !== 'condition') return

  const nextEdges = edges.filter((edge) => {
    if (edge.source !== node.id) return false
    if (node.data?.kind !== 'condition') return true
    const expectedHandle = shouldContinue ? 'true' : 'false'
    return (edge.sourceHandle || 'true') === expectedHandle
  })
  await Promise.all(nextEdges.map((edge) => walk(nodesById.get(edge.target), nodesById, edges, visited, options)))
}

async function executeNode(node, options = {}) {
  throwIfCancelled(options.signal)
  const data = node.data ?? {}
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

  if (data.kind === 'end') {
    return true
  }

  if (data.kind === 'service') {
    const payload = parsePayload(data.payload)
    const entityIds = data.entityIds ?? []
    if (entityIds.length) {
      const entityTarget = entityIds.length === 1 ? entityIds[0] : entityIds
      payload.entity_id = entityTarget
    }
    await callService(data.domain, data.service, payload)
    log('info', `Called ${data.domain}.${data.service}.`)
    await verifyServiceResult(data, entityIds)
    return true
  }

  if (data.kind === 'notify') {
    const target = data.target || 'notify.notify'
    const [, service = 'notify'] = target.split('.')
    await callService('notify', service, { message: data.message || 'HAFlow notification' })
    log('info', `Sent notification via ${target}.`)
    return true
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

  log('info', `${data.label || data.kind || 'Node'} triggered.`)
  return true
}

async function fireTimeTriggers() {
  const now = new Date()
  const key = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`
  if (key === lastTimeKey) return
  lastTimeKey = key

  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  for (const entry of await getRunnableFlowEntries()) {
    const matches = entry.flow.nodes.filter((node) => !node.data?.disabled && node.data?.kind === 'time' && node.data?.at === currentTime)
    for (const node of matches) {
      triggerNode(entry.flow, entry.meta, node, { reason: `time ${currentTime}` }).catch((error) => log('error', error.message))
    }
  }
}

async function handleHomeAssistantEvent(event) {
  if (!event?.event_type) return

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
  const pico = await readJson(path.join(examplesDir, '5-button-pico-example.json'), createFiveButtonPicoFlow())
  return [
    { name: 'Starter - Simple Motion Light', flow: simpleMotion },
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
      { id: 'starter-evening-time', type: 'haflow', position: { x: 80, y: 100 }, data: { kind: 'time', label: 'Every Evening', at: '19:00' } },
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

function ensureUniqueFlowName(name, flows) {
  const baseName = String(name || 'New Flow').trim() || 'New Flow'
  const existing = new Set(flows.map((flow) => String(flow.name || '').trim().toLowerCase()))
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
