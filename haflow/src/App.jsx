import { Component, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  addEdge,
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import packageInfo from '../package.json'
import {
  Activity,
  AlertTriangle,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignHorizontalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  Bell,
  Cable,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Download,
  FilePlus,
  GitBranch,
  History,
  Home,
  ListTree,
  Moon,
  PanelRightClose,
  PanelRightOpen,
  Pause,
  Play,
  PlugZap,
  Power,
  Save,
  Search,
  Settings,
  Split,
  SquarePlay,
  Sun,
  Timer,
  Hourglass,
  Trash2,
  Redo2,
  RefreshCw,
  Upload,
  Ban,
  Undo2,
  X,
  Zap,
} from 'lucide-react'
import './App.css'

const ALL_ENTITY_AREAS = '__all_entity_areas__'
const APP_VERSION = packageInfo.version
const TARGETLESS_SERVICE_DOMAINS = new Set(['notify', 'persistent_notification'])
const BINARY_SENSOR_STATE_LABELS = {
  battery: { on: 'Low', off: 'Normal' },
  battery_charging: { on: 'Charging', off: 'Not Charging' },
  carbon_monoxide: { on: 'Detected', off: 'Clear' },
  cold: { on: 'Cold', off: 'Normal' },
  connectivity: { on: 'Connected', off: 'Disconnected' },
  door: { on: 'Open', off: 'Closed' },
  garage_door: { on: 'Open', off: 'Closed' },
  gas: { on: 'Detected', off: 'Clear' },
  heat: { on: 'Hot', off: 'Normal' },
  light: { on: 'Detected', off: 'Clear' },
  lock: { on: 'Unlocked', off: 'Locked' },
  moisture: { on: 'Wet', off: 'Dry' },
  motion: { on: 'Detected', off: 'Clear' },
  moving: { on: 'Moving', off: 'Stopped' },
  occupancy: { on: 'Detected', off: 'Clear' },
  opening: { on: 'Open', off: 'Closed' },
  plug: { on: 'Plugged In', off: 'Unplugged' },
  power: { on: 'Powered', off: 'No Power' },
  presence: { on: 'Detected', off: 'Clear' },
  problem: { on: 'Problem', off: 'OK' },
  running: { on: 'Running', off: 'Not Running' },
  safety: { on: 'Unsafe', off: 'Safe' },
  smoke: { on: 'Detected', off: 'Clear' },
  sound: { on: 'Detected', off: 'Clear' },
  tamper: { on: 'Tampered', off: 'Clear' },
  update: { on: 'Available', off: 'Up To Date' },
  vibration: { on: 'Detected', off: 'Clear' },
  window: { on: 'Open', off: 'Closed' },
}
const LUTRON_5_BUTTON_PICO_ROWS = [
  { label: 'Button 1 Top', number: 1 },
  { label: 'Button 2 Up', number: 2 },
  { label: 'Button 5 Center', number: 5 },
  { label: 'Button 3 Down', number: 3 },
  { label: 'Button 4 Bottom', number: 4 },
]

const nodeCatalog = [
  {
    type: 'state',
    label: 'Trigger',
    description: 'Starts a flow when a selected Home Assistant entity changes state.',
    icon: Activity,
    color: '#0f766e',
    data: { entityId: '', from: '', to: '', label: 'Trigger' },
  },
  {
    type: 'event',
    label: 'Event',
    description: 'Starts a flow from a Home Assistant event, optionally filtered to an entity and state.',
    icon: Zap,
    color: '#7c3aed',
    data: { eventType: 'state_changed', entityId: '', from: '', to: '', label: 'Event' },
  },
  {
    type: 'time',
    label: 'Schedule',
    description: 'Starts a flow at a specific time of day.',
    icon: Clock,
    color: '#b45309',
    data: { at: '07:00', label: 'Schedule' },
  },
  {
    type: 'condition',
    label: 'Condition',
    description: 'Checks a value and sends the flow through the true or false output.',
    icon: GitBranch,
    color: '#2563eb',
    data: { entityId: '', operator: 'equals', value: 'on', label: 'Condition' },
  },
  {
    type: 'or',
    label: 'OR',
    description: 'Continues when any incoming trigger or branch reaches this node.',
    icon: Split,
    color: '#0891b2',
    data: { label: 'OR' },
  },
  {
    type: 'group',
    label: 'Group',
    description: 'Frames a set of nodes as a same-screen subflow that can move, copy, or delete together.',
    icon: ListTree,
    color: '#64748b',
    data: { label: 'Subflow' },
  },
  {
    type: 'delay',
    label: 'Delay',
    description: 'Pauses for a fixed amount of time, then continues automatically.',
    icon: Timer,
    color: '#475569',
    data: { seconds: 5, label: 'Delay' },
  },
  {
    type: 'wait',
    label: 'Wait',
    description: 'Pauses until a selected entity reaches a chosen state, or until timeout.',
    icon: Hourglass,
    color: '#b45309',
    data: { entityId: '', to: 'on', timeoutSeconds: 300, label: 'Wait' },
  },
  {
    type: 'service',
    label: 'Action',
    description: 'Runs a Home Assistant service, such as turning on one or more lights.',
    icon: PlugZap,
    color: '#c2410c',
    data: { domain: 'light', service: 'turn_on', entityIds: [], payload: '{}', label: 'Action' },
  },
  {
    type: 'notify',
    label: 'Notify',
    description: 'Sends a Home Assistant notification message.',
    icon: Bell,
    color: '#be123c',
    data: { message: 'HAFlow ran', target: '', label: 'Notify' },
  },
  {
    type: 'scene',
    label: 'Scene',
    description: 'Turns on a Home Assistant scene.',
    icon: Home,
    color: '#15803d',
    data: { entityId: '', label: 'Scene' },
  },
  {
    type: 'debug',
    label: 'Debug',
    description: 'Writes a message to the run log so you can test and trace a flow.',
    icon: ListTree,
    color: '#334155',
    data: { message: 'Reached debug node', label: 'Debug' },
  },
]

const RUNTIME_AFTERGLOW_MS = 10_000

function appUrl(path) {
  return new URL(String(path).replace(/^\/+/, ''), document.baseURI).toString()
}

function apiFetch(path, options) {
  return fetch(appUrl(path), options)
}

function getWebSocketUrl() {
  const url = new URL(appUrl('/ws'))
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

function getInitialTheme() {
  const savedTheme = window.localStorage.getItem('haflow-theme')
  if (savedTheme === 'dark' || savedTheme === 'light') return savedTheme
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function getInitialInspectorCollapsed() {
  return window.localStorage.getItem('haflow-inspector-collapsed') === 'true'
}

function getInitialLibraryCollapsed() {
  return window.localStorage.getItem('haflow-library-collapsed') === 'true'
}

function getInitialRunHistoryCollapsed() {
  return window.localStorage.getItem('haflow-run-history-collapsed') === 'true'
}

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function getCatalogColor(kind) {
  return nodeCatalog.find((item) => item.type === kind)?.color ?? '#64748b'
}

function getCatalogLabel(kind) {
  return nodeCatalog.find((item) => item.type === kind)?.label ?? 'Node'
}

function getMiniMapNodeColor(node) {
  if (node.selected) return '#0f766e'
  if (node.data?.runtimeStatus === 'active') return '#ccfbf1'
  if (node.data?.runtimeStatus === 'done') return '#d1fae5'
  if (node.data?.runtimeStatus === 'stopped') return '#fef3c7'
  return '#ffffff'
}

function getMiniMapNodeStrokeColor(node) {
  if (node.selected) return '#042f2e'
  if (node.data?.runtimeStatus === 'active') return '#0f766e'
  if (node.data?.runtimeStatus === 'done') return '#0f766e'
  if (node.data?.runtimeStatus === 'stopped') return '#c2410c'
  return getCatalogColor(node.data?.kind)
}

const initialNodes = [
  {
    id: 'state-1',
    type: 'haflow',
    position: { x: 80, y: 90 },
    data: {
      kind: 'state',
      label: 'Front Door Opens',
      entityId: 'binary_sensor.front_door',
      from: 'off',
      to: 'on',
    },
  },
  {
    id: 'condition-1',
    type: 'haflow',
    position: { x: 370, y: 90 },
    data: {
      kind: 'condition',
      label: 'After Sunset',
      entityId: 'sun.sun',
      operator: 'equals',
      value: 'below_horizon',
    },
  },
  {
    id: 'service-1',
    type: 'haflow',
    position: { x: 660, y: 90 },
    data: {
      kind: 'service',
      label: 'Turn Hall Light On',
      domain: 'light',
      service: 'turn_on',
      entityId: 'light.hallway',
      payload: '{\n  "brightness_pct": 65\n}',
    },
  },
]

const initialEdges = [
  { id: 'e-state-condition', source: 'state-1', target: 'condition-1' },
  { id: 'e-condition-service', source: 'condition-1', target: 'service-1' },
]

const ANY_CHANGE = '__changed__'

function NodeBody({ data, selected }) {
  const catalogItem = nodeCatalog.find((item) => item.type === data.kind) ?? nodeCatalog[0]
  const Icon = catalogItem.icon
  const validation = validateNodeData(data)
  const runtimeStatus = data.runtimeStatus
  const disabled = data.disabled
  const summaryLines = summarizeNode(data)

  if (data.kind === 'group') {
    return (
      <div className={`group-node ${selected ? 'selected' : ''}`} style={{ '--node-color': catalogItem.color }}>
        <div className="group-node-title">
          <Icon size={15} />
          <span>{data.label || catalogItem.label}</span>
        </div>
        {data.groupDeviceName ? <div className="group-node-device"><strong>{data.groupDeviceName}</strong></div> : null}
      </div>
    )
  }

  return (
    <div className={`flow-node ${selected ? 'selected' : ''} ${validation ? 'invalid' : ''} ${runtimeStatus ? `runtime-${runtimeStatus}` : ''} ${disabled ? 'disabled' : ''}`} data-tooltip={catalogItem.description} style={{ '--node-color': catalogItem.color }} tabIndex={0}>
      <Handle type="target" position={Position.Left} />
      <div className="node-header">
        <span className="node-icon"><Icon size={16} /></span>
        <span>{data.label || catalogItem.label}</span>
      </div>
      <div className="node-meta">
        {(Array.isArray(summaryLines) ? summaryLines : [summaryLines]).map((line, index) => (
          typeof line === 'object' ? (
            <span className="node-meta-status" key={`${line.name}-${index}`}>
              <span>{line.name}</span>
              <strong>{line.status}</strong>
            </span>
          ) : (
            <span key={`${line}-${index}`}>{line}</span>
          )
        ))}
      </div>
      {data.delayRemainingMs !== undefined && <div className="node-countdown">Remaining {formatDuration(data.delayRemainingMs)}</div>}
      {data.lastExecutedAt && <div className="node-executed">Last run {formatNodeRunTime(data.lastExecutedAt)}</div>}
      {disabled && <div className="node-disabled"><Ban size={13} /> Disabled</div>}
      {runtimeStatus && <div className="node-runtime">{runtimeStatus === 'active' ? 'Running' : runtimeStatus === 'stopped' ? 'Stopped' : 'Completed'}</div>}
      {validation && <div className="node-warning"><AlertTriangle size={13} /> {validation}</div>}
      {data.kind === 'condition' ? (
        <>
          <Handle className="condition-handle condition-true" id="true" type="source" position={Position.Right} title="True" />
          <Handle className="condition-handle condition-false" id="false" type="source" position={Position.Right} title="False" />
        </>
      ) : (
        <Handle type="source" position={Position.Right} />
      )}
    </div>
  )
}

const nodeTypes = { haflow: NodeBody }

function summarizeNode(data) {
  const selectedCount = data.entityIds?.length ?? 0
  const entityName = formatEntityRef(data)
  const entityState = data.entityStatusLabel || formatEntityStatus(data.entityStatus)
  if (data.kind === 'state') {
    const rules = getStateTriggerRules(data)
    if (rules.length > 1) return `${rules.length} triggers`
    return data.entityId ? { name: entityName, status: entityState } : 'Choose an entity'
  }
  if (data.kind === 'event') {
    if (data.eventType === 'state_changed' && data.entityId) return { name: entityName, status: entityState }
    return data.eventType || 'Any event'
  }
  if (data.kind === 'time') return `At ${data.at || '00:00'}`
  if (data.kind === 'condition') {
    const rules = getConditionRules(data)
    if (rules.length > 1) return `${rules.length} ${data.conditionMode === 'all' ? 'AND' : 'OR'} conditions`
    return data.entityId ? { name: entityName, status: entityState } : 'Choose a condition'
  }
  if (data.kind === 'or') return 'Any incoming path continues'
  if (data.kind === 'delay') return `${data.seconds || 0}s`
  if (data.kind === 'wait') return data.entityId ? { name: entityName, status: entityState } : 'Choose an entity'
  if (data.kind === 'service') {
    if (data.actionEntities?.length) {
      return data.actionEntities.map((entity) => ({ name: entity.name, status: entity.statusLabel || formatEntityStatus(entity.state) }))
    }
    return selectedCount ? `${selectedCount} devices selected` : 'Choose entities'
  }
  if (data.kind === 'notify') return data.message || 'Notification'
  if (data.kind === 'scene') return data.entityId ? { name: entityName, status: entityState } : 'Choose a scene'
  if (data.kind === 'group') return 'Same-screen subflow'
  return data.message || 'Debug output'
}

function formatEntityRef(data) {
  return data.entityDisplayName || data.entityId || 'Entity'
}

function formatEntityStatus(value, entity) {
  if (value === undefined || value === null || value === '') return 'Unknown'
  return formatStateOption(value, entity)
}

function getStateLabelMap(entity) {
  if (entity?.domain !== 'binary_sensor') return null
  const deviceClass = String(entity.attributes?.device_class || '').toLowerCase()
  return BINARY_SENSOR_STATE_LABELS[deviceClass] || { on: 'On', off: 'Off' }
}

function getFlowEntityStatusClass(value) {
  const normalized = String(value ?? '').toLowerCase()
  if (normalized === 'on' || normalized === 'open' || normalized === 'detected' || normalized === 'home') return 'is-on'
  if (normalized === 'off' || normalized === 'closed' || normalized === 'clear' || normalized === 'not_home') return 'is-off'
  if (normalized === 'unavailable' || normalized === 'unknown') return 'is-unavailable'
  return 'is-neutral'
}

function getConditionRules(data) {
  const rules = Array.isArray(data?.conditions) && data.conditions.length
    ? data.conditions
    : data?.entityId
      ? [{
        id: 'condition-legacy',
        entityId: data.entityId,
        attribute: data.attribute || 'state',
        operator: data.operator || 'equals',
        value: data.value ?? '',
      }]
      : []

  return rules
    .filter((rule) => rule && typeof rule === 'object')
    .map((rule, index) => ({
      id: rule.id || `condition-${index + 1}`,
      entityId: String(rule.entityId ?? ''),
      attribute: String(rule.attribute || 'state'),
      operator: ['equals', 'not_equals', 'contains'].includes(rule.operator) ? rule.operator : 'equals',
      value: rule.value ?? '',
    }))
}

function getStateTriggerRules(data) {
  const rules = Array.isArray(data?.triggers) && data.triggers.length
    ? data.triggers
    : data?.entityId || data?.deviceId
      ? [{
        id: 'trigger-legacy',
        entityId: data.entityId ?? '',
        deviceId: data.deviceId ?? '',
        deviceIdentifiers: data.deviceIdentifiers ?? [],
        buttonNumber: data.buttonNumber,
        from: data.from ?? '',
        to: data.to ?? '',
      }]
      : []

  return rules
    .filter((rule) => rule && typeof rule === 'object')
    .map((rule, index) => ({
      id: rule.id || `trigger-${index + 1}`,
      entityId: String(rule.entityId ?? ''),
      deviceId: String(rule.deviceId ?? ''),
      deviceIdentifiers: Array.isArray(rule.deviceIdentifiers) ? rule.deviceIdentifiers : [],
      buttonNumber: rule.buttonNumber,
      from: rule.from ?? '',
      to: rule.to ?? '',
    }))
}

function collectFlowEntityIds(nodes) {
  const entityIds = new Set()
  const addEntityId = (value) => {
    if (typeof value !== 'string') return
    const trimmed = value.trim()
    if (!trimmed || !trimmed.includes('.')) return
    entityIds.add(trimmed)
  }
  const addDeviceId = (value) => {
    if (typeof value !== 'string') return
    const trimmed = value.trim()
    if (!trimmed) return
    entityIds.add(trimmed.startsWith('device.') ? trimmed : `device.${trimmed}`)
  }
  const addEntityValue = (value) => {
    if (Array.isArray(value)) {
      value.forEach(addEntityValue)
      return
    }
    if (typeof value === 'string') {
      value.split(',').map((item) => item.trim()).filter(Boolean).forEach(addEntityId)
    }
  }

  nodes.forEach((node) => {
    const data = node.data ?? {}
    addEntityValue(data.entityId)
    addEntityValue(data.entityIds)
    addDeviceId(data.deviceId)
    getStateTriggerRules(data).forEach((rule) => {
      addEntityValue(rule.entityId)
      addDeviceId(rule.deviceId)
    })
    getConditionRules(data).forEach((rule) => addEntityValue(rule.entityId))

    const payload = parsePayloadObject(data.payload)
    addEntityValue(payload.entity_id)
    addEntityValue(payload.target?.entity_id)
  })

  return Array.from(entityIds)
}

function formatNodeRunTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.ceil(Number(milliseconds || 0) / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60
    return `${hours}:${String(remainingMinutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function validateNodeData(data, entityById = new Map(), services = {}) {
  if (data.disabled) return ''
  const hasEntityCatalog = entityById.size > 0
  const entityExists = (entityId) => !entityId || !hasEntityCatalog || entityById.has(entityId)
  if (data.kind === 'state') {
    const rules = getStateTriggerRules(data)
    if (!rules.length || rules.some((rule) => !rule.entityId && !rule.deviceId)) return 'Missing entity'
    if (rules.some((rule) => rule.entityId && !entityExists(rule.entityId))) return 'Entity not found'
  }
  if (data.kind === 'event' && data.entityId && !entityExists(data.entityId)) return 'Entity not found'
  if (data.kind === 'time' && !data.at) return 'Missing time'
  if (data.kind === 'condition') {
    const rules = getConditionRules(data)
    if (!rules.length || rules.some((rule) => !rule.entityId)) return 'Missing entity'
    if (rules.some((rule) => rule.entityId && !entityExists(rule.entityId))) return 'Entity not found'
    if (rules.some((rule) => !rule.value && rule.operator !== 'exists')) return 'Missing value'
  }
  if (data.kind === 'wait' && !data.entityId) return 'Missing entity'
  if (data.kind === 'wait' && data.entityId && !entityExists(data.entityId)) return 'Entity not found'
  if (data.kind === 'service') {
    if (!data.domain || !data.service) return 'Missing service'
    if (services[data.domain] && !services[data.domain][data.service]) return 'Service not found'
    const entityIds = data.entityIds?.length ? data.entityIds : (data.entityId ? [data.entityId] : [])
    if (entityIds.some((entityId) => !entityExists(entityId))) return 'Entity not found'
    if (data.payload && String(data.payload).trim()) {
      try {
        JSON.parse(data.payload)
      } catch {
        return 'Bad JSON'
      }
    }
  }
  if (data.kind === 'scene' && !data.entityId) return 'Missing scene'
  if (data.kind === 'scene' && data.entityId && !entityExists(data.entityId)) return 'Scene not found'
  return ''
}

function validateFlow(nodes, edges, entityById = new Map(), services = {}, isPaused = false) {
  const issues = []
  const outgoing = new Map(nodes.map((node) => [node.id, 0]))
  const incoming = new Map(nodes.map((node) => [node.id, 0]))
  edges.forEach((edge) => outgoing.set(edge.source, (outgoing.get(edge.source) ?? 0) + 1))
  edges.forEach((edge) => incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1))

  if (isPaused) issues.push('Flow is paused')
  if (!nodes.some((node) => !node.data?.disabled && ['state', 'event', 'time'].includes(node.data?.kind))) {
    issues.push('No active trigger node')
  }

  for (const node of nodes) {
    if (node.data?.disabled) continue
    const nodeIssue = validateNodeData(node.data ?? {}, entityById, services)
    if (nodeIssue) issues.push(`${node.data?.label || node.id}: ${nodeIssue}`)
    if (node.data?.kind === 'service') {
      const entityIds = node.data.entityIds?.length ? node.data.entityIds : (node.data.entityId ? [node.data.entityId] : [])
      if (!entityIds.length && !TARGETLESS_SERVICE_DOMAINS.has(node.data.domain) && !String(node.data.payload || '').includes('entity_id')) issues.push(`${node.data?.label || node.id}: No target entity`)
    }
    if (node.data?.kind === 'condition' && !incoming.get(node.id)) {
      issues.push(`${node.data?.label || node.id}: No incoming link`)
    }
    if (['state', 'event', 'time', 'condition', 'or', 'delay', 'wait'].includes(node.data?.kind) && !outgoing.get(node.id)) {
      issues.push(`${node.data?.label || node.id}: No outgoing link`)
    }
  }

  return issues
}

function expandNodeSelection(nodes, selectedIds) {
  const selected = new Set(selectedIds)
  let changed = true
  while (changed) {
    changed = false
    for (const node of nodes) {
      if (node.parentId && selected.has(node.parentId) && !selected.has(node.id)) {
        selected.add(node.id)
        changed = true
      }
    }
  }
  return selected
}

function getNodeSize(node) {
  return {
    width: Number(node.measured?.width || node.width || node.style?.width || (node.data?.kind === 'group' ? 520 : 232)),
    height: Number(node.measured?.height || node.height || node.style?.height || (node.data?.kind === 'group' ? 320 : 92)),
  }
}

function getAbsoluteNodePosition(node, nodeById) {
  if (!node?.parentId) return node.position
  const parent = nodeById.get(node.parentId)
  const parentPosition = getAbsoluteNodePosition(parent, nodeById)
  return {
    x: parentPosition.x + node.position.x,
    y: parentPosition.y + node.position.y,
  }
}

function getNodesBoundsForGroup(nodes) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const boxes = nodes.map((node) => {
    const position = getAbsoluteNodePosition(node, nodeById)
    const size = getNodeSize(node)
    return {
      minX: position.x,
      minY: position.y,
      maxX: position.x + size.width,
      maxY: position.y + size.height,
    }
  })
  return {
    minX: Math.min(...boxes.map((box) => box.minX)),
    minY: Math.min(...boxes.map((box) => box.minY)),
    maxX: Math.max(...boxes.map((box) => box.maxX)),
    maxY: Math.max(...boxes.map((box) => box.maxY)),
  }
}

function createGroupNode({ bounds, id, label = 'Subflow' }) {
  const padding = 34
  const header = 42
  return {
    id,
    type: 'haflow',
    position: {
      x: bounds.minX - padding,
      y: bounds.minY - header,
    },
    data: { kind: 'group', label },
    style: {
      width: Math.max(360, bounds.maxX - bounds.minX + padding * 2),
      height: Math.max(180, bounds.maxY - bounds.minY + header + padding),
    },
  }
}

function isTypingTarget(target) {
  const tagName = target?.tagName?.toLowerCase()
  return target?.isContentEditable || ['input', 'select', 'textarea'].includes(tagName)
}

function isEntitySelected(node, entityId) {
  if (!node) return false
  if (node.data?.entityIds?.includes(entityId)) return true
  if (node.data?.kind === 'condition' && getConditionRules(node.data).some((rule) => rule.entityId === entityId)) return true
  if (node.data?.kind === 'state' && getStateTriggerRules(node.data).some((rule) => rule.entityId === entityId)) return true
  return node.data?.kind !== 'service' && node.data?.entityId === entityId
}

function enrichNodeDisplayData(data, entityById, runtimeState, now, forceSnapshot = false) {
  const entity = data?.entityId ? entityById.get(data.entityId) : null
  const delayRemainingMs = runtimeState?.delayUntil
    ? Math.max(0, Date.parse(runtimeState.delayUntil) - now)
    : runtimeState?.remainingMs
  const actionEntities = (data?.entityIds ?? [])
    .map((entityId) => entityById.get(entityId))
    .filter(Boolean)
    .map((item) => ({
      id: item.entity_id,
      name: item.friendlyName || item.entity_id,
      state: item.state,
      statusLabel: formatEntityStatus(item.state, item),
    }))

  return {
    ...data,
    actionEntities,
    entityDisplayName: entity?.friendlyName || data?.entityId,
    entityStatus: entity?.state,
    entityStatusLabel: formatEntityStatus(entity?.state, entity),
    delayRemainingMs,
    lastExecutedAt: runtimeState?.lastExecutedAt,
    runtimeStatus: getVisibleRuntimeStatus(runtimeState, now, forceSnapshot),
  }
}

function getGroupDeviceName(groupNode, nodes, entityById) {
  const childDeviceNames = nodes
    .filter((node) => node.parentId === groupNode.id && node.data?.kind === 'state')
    .flatMap((node) => getStateTriggerRules(node.data).map((rule) => ({
      deviceId: rule.deviceId || node.data.deviceId,
      deviceName: rule.deviceName || node.data.deviceName,
      entityId: rule.entityId || node.data.entityId,
    })))
    .map((rule) => {
      const deviceEntityId = rule.deviceId ? `device.${rule.deviceId}` : rule.entityId
      const device = deviceEntityId ? entityById.get(deviceEntityId) : null
      return device?.friendlyName || rule.deviceName || (String(deviceEntityId || '').startsWith('device.') ? deviceEntityId : '')
    })
    .filter(Boolean)

  const uniqueNames = Array.from(new Set(childDeviceNames))
  return uniqueNames.length === 1 ? uniqueNames[0] : (groupNode.data?.groupDeviceName || '')
}

function getVisibleRuntimeStatus(runtimeState, now = Date.now(), forceSnapshot = false) {
  const status = runtimeState?.status || ''
  if (!status) return ''
  if (forceSnapshot && runtimeState?.lastExecutedAt) return status
  if (status === 'active') return status
  const lastRunTime = Date.parse(runtimeState.lastExecutedAt || '')
  if (Number.isNaN(lastRunTime)) return ''
  return now - lastRunTime <= RUNTIME_AFTERGLOW_MS ? status : ''
}

function mergeEntityCatalog(currentEntities, nextEntities) {
  const currentById = new Map(currentEntities.map((entity) => [entity.entity_id, entity]))
  return nextEntities.map((nextEntity) => {
    const currentEntity = currentById.get(nextEntity.entity_id)
    if (!currentEntity) return nextEntity
    return isEntityUpdateNewer(nextEntity, currentEntity)
      ? { ...currentEntity, ...nextEntity, attributes: { ...currentEntity.attributes, ...nextEntity.attributes } }
      : { ...nextEntity, ...currentEntity, attributes: { ...nextEntity.attributes, ...currentEntity.attributes } }
  })
}

function mergeEntityStateUpdate(currentEntities, update) {
  let found = false
  const nextEntities = currentEntities.map((entity) => {
    if (entity.entity_id !== update.entity_id) return entity
    found = true
    if (!isEntityUpdateNewer(update, entity)) return entity
    return {
      ...entity,
      state: update.state,
      attributes: { ...entity.attributes, ...update.attributes },
      last_changed: update.last_changed,
      last_updated: update.last_updated,
      valueOptions: Array.from(new Set([...(entity.valueOptions ?? []), update.state].filter(Boolean))),
    }
  })

  return found ? nextEntities : currentEntities.concat(update)
}

function isSelectableEntity(entity) {
  return entity?.catalogType !== 'device' && String(entity?.entity_id || '').includes('.')
}

function isDeviceCatalogItem(entity) {
  return entity?.catalogType === 'device' && entity.deviceId
}

function buildDeviceTriggerData(data, device, buttonNumberOverride) {
  const rules = getStateTriggerRules(data)
  const baseRule = rules[0] ?? { id: createId(), from: '', to: '' }
  const keepLabel = /^button\s+\d+\b/i.test(String(data.label || ''))
  const picoRow = LUTRON_5_BUTTON_PICO_ROWS.find((row) => row.number === buttonNumberOverride)
  const buttonNumber = picoRow?.number ?? buttonNumberOverride ?? getButtonNumberFromLabel(data.label)

  return {
    triggers: [{
      ...baseRule,
      entityId: device.entity_id,
      deviceId: device.deviceId,
      deviceName: device.friendlyName || '',
      deviceIdentifiers: device.attributes?.identifiers ?? [],
      buttonNumber,
      from: '',
      to: '',
    }],
    entityId: device.entity_id,
    deviceId: device.deviceId,
    deviceName: device.friendlyName || '',
    deviceIdentifiers: device.attributes?.identifiers ?? [],
    buttonNumber,
    from: '',
    to: '',
    label: picoRow?.label ?? (buttonNumber ? `Button ${buttonNumber} Pressed` : keepLabel ? data.label : (device.friendlyName || data.label || getCatalogLabel('state'))),
  }
}

function getButtonNumberFromLabel(label) {
  const match = String(label || '').match(/\bbutton\s+(\d+)\b/i)
  return match ? Number(match[1]) : undefined
}

function getCatalogItemSubtitle(entity) {
  if (entity?.catalogType === 'device') {
    return entity.attributes?.model || entity.attributes?.manufacturer || 'Home Assistant device'
  }
  return entity?.state ?? ''
}

function getCatalogItemDetail(entity) {
  if (entity?.catalogType === 'device') return `Device: ${entity.deviceId}`
  return entity?.entity_id || ''
}

function normalizeRuntimeSnapshot(runtime) {
  return Object.fromEntries(Object.entries(runtime).map(([nodeId, state]) => [
    nodeId,
    {
      lastExecutedAt: state.lastExecutedAt,
      delayUntil: state.delayUntil,
      remainingMs: state.status === 'progress' ? state.remainingMs : undefined,
      runId: state.runId,
      status: normalizeNodeStatus(state.status),
    },
  ]))
}

function normalizeNodeStatus(state) {
  if (['start', 'progress'].includes(state)) return 'active'
  if (state === 'stop') return 'stopped'
  if (state === 'finish') return 'done'
  return state || ''
}

function isEntityUpdateNewer(nextEntity, currentEntity) {
  const nextTime = Date.parse(nextEntity?.last_updated || nextEntity?.last_changed || '')
  const currentTime = Date.parse(currentEntity?.last_updated || currentEntity?.last_changed || '')
  if (Number.isNaN(nextTime) || Number.isNaN(currentTime)) return true
  return nextTime >= currentTime
}

const defaultViewport = { x: 0, y: 0, zoom: 1 }

function normalizeViewport(viewport) {
  return {
    x: Number.isFinite(viewport?.x) ? viewport.x : defaultViewport.x,
    y: Number.isFinite(viewport?.y) ? viewport.y : defaultViewport.y,
    zoom: Number.isFinite(viewport?.zoom) ? viewport.zoom : defaultViewport.zoom,
  }
}

function FlowWorkspace() {
  const wrapperRef = useRef(null)
  const importRef = useRef(null)
  const backupImportRef = useRef(null)
  const saveFlowRef = useRef(null)
  const runFlowRef = useRef(null)
  const viewportRef = useRef(defaultViewport)
  const viewportSaveTimeoutRef = useRef(null)
  const lastSavedSnapshotRef = useRef('')
  const historyRef = useRef([])
  const historyIndexRef = useRef(-1)
  const isApplyingHistoryRef = useRef(false)
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [selectedId, setSelectedId] = useState(null)
  const [selectedNodeIds, setSelectedNodeIds] = useState([])
  const [selectedEdgeId, setSelectedEdgeId] = useState(null)
  const [connection, setConnection] = useState({ connected: false, entityCount: 0, serviceCount: 0 })
  const [entities, setEntities] = useState([])
  const [services, setServices] = useState({})
  const [logs, setLogs] = useState([])
  const [runHistory, setRunHistory] = useState([])
  const [query, setQuery] = useState('')
  const [runner, setRunner] = useState({ enabled: false, connected: false, running: 0, triggerCount: 0 })
  const [nodeRuntime, setNodeRuntime] = useState({})
  const [runtimeClock, setRuntimeClock] = useState(Date.now())
  const [entityReloadStatus, setEntityReloadStatus] = useState('idle')
  const [flows, setFlows] = useState([])
  const [activeFlowId, setActiveFlowId] = useState('default')
  const [newFlowName, setNewFlowName] = useState('')
  const [hasLoadedFlow, setHasLoadedFlow] = useState(false)
  const [saveStatus, setSaveStatus] = useState('loading')
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false })
  const [selectedAreaName, setSelectedAreaName] = useState('')
  const [viewport, setViewport] = useState(defaultViewport)
  const [showLastRunSnapshot, setShowLastRunSnapshot] = useState(false)
  const [theme, setTheme] = useState(getInitialTheme)
  const [isInspectorCollapsed, setIsInspectorCollapsed] = useState(getInitialInspectorCollapsed)
  const [isLibraryCollapsed, setIsLibraryCollapsed] = useState(getInitialLibraryCollapsed)
  const [isRunHistoryCollapsed, setIsRunHistoryCollapsed] = useState(getInitialRunHistoryCollapsed)
  const [isLogModalOpen, setIsLogModalOpen] = useState(false)
  const [logQuery, setLogQuery] = useState('')
  const isDarkTheme = theme === 'dark'
  const { screenToFlowPosition, setViewport: setReactFlowViewport, getViewport } = useReactFlow()

  const selectedNode = nodes.find((node) => node.id === selectedId)
  const selectedNodeIdSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds])
  const hasNodeSelection = selectedNodeIds.length > 0
  const activeFlow = flows.find((flow) => flow.id === activeFlowId)
  const sortedFlows = useMemo(() => [...flows].sort((first, second) => first.name.localeCompare(second.name)), [flows])
  const entityById = useMemo(() => new Map(entities.map((entity) => [entity.entity_id, entity])), [entities])
  const filteredLogs = useMemo(() => {
    const queryText = logQuery.trim().toLowerCase()
    if (!queryText) return logs
    return logs.filter((entry) => `${entry.level} ${entry.message} ${new Date(entry.time).toLocaleTimeString()}`.toLowerCase().includes(queryText))
  }, [logQuery, logs])
  const flowDeviceStatuses = useMemo(() => collectFlowEntityIds(nodes)
    .map((entityId) => {
      const entity = entityById.get(entityId)
      const isDevice = entity?.catalogType === 'device' || entityId.startsWith('device.')
      return {
        entityId,
        name: entity?.friendlyName || entityId,
        state: isDevice ? 'device' : entity?.state ?? 'unavailable',
        stateLabel: isDevice ? 'Device' : formatEntityStatus(entity?.state ?? 'unavailable', entity),
      }
    })
    .sort((first, second) => first.name.localeCompare(second.name) || first.entityId.localeCompare(second.entityId)), [entityById, nodes])
  const hasLastRunSnapshot = useMemo(() => nodes.some((node) => nodeRuntime[node.id]?.lastExecutedAt), [nodeRuntime, nodes])
  const lastRunSnapshotId = useMemo(() => {
    const latest = nodes
      .map((node) => nodeRuntime[node.id])
      .filter((runtime) => runtime?.lastExecutedAt)
      .sort((first, second) => Date.parse(second.lastExecutedAt) - Date.parse(first.lastExecutedAt))[0]
    return latest?.runId || (latest ? '__legacy_last_run__' : '')
  }, [nodeRuntime, nodes])
  const lastTriggeredAt = useMemo(() => {
    const latest = nodes
      .map((node) => nodeRuntime[node.id])
      .filter((runtime) => runtime?.lastExecutedAt)
      .sort((first, second) => Date.parse(second.lastExecutedAt) - Date.parse(first.lastExecutedAt))[0]
    return latest?.lastExecutedAt || ''
  }, [nodeRuntime, nodes])
  const isInLastRunSnapshot = useCallback((nodeId) => {
    if (!showLastRunSnapshot || !lastRunSnapshotId) return false
    const runtime = nodeRuntime[nodeId]
    if (!runtime?.lastExecutedAt) return false
    return lastRunSnapshotId === '__legacy_last_run__' ? true : runtime.runId === lastRunSnapshotId
  }, [lastRunSnapshotId, nodeRuntime, showLastRunSnapshot])
  const displayNodes = useMemo(() => nodes.map((node) => ({
    ...node,
    selected: selectedNodeIdSet.has(node.id),
    data: {
      ...enrichNodeDisplayData(node.data, entityById, nodeRuntime[node.id], runtimeClock, isInLastRunSnapshot(node.id)),
      groupDeviceName: node.data?.kind === 'group' ? getGroupDeviceName(node, nodes, entityById) : undefined,
    },
  })), [entityById, isInLastRunSnapshot, nodeRuntime, nodes, runtimeClock, selectedNodeIdSet])
  const displayEdges = useMemo(() => edges.map((edge) => {
    const sourceStatus = getVisibleRuntimeStatus(nodeRuntime[edge.source], runtimeClock, isInLastRunSnapshot(edge.source))
    const targetStatus = getVisibleRuntimeStatus(nodeRuntime[edge.target], runtimeClock, isInLastRunSnapshot(edge.target))
    const isRuntimeEdge = Boolean(sourceStatus && targetStatus)
    return {
      ...edge,
      className: [edge.className, isRuntimeEdge ? 'runtime-edge' : ''].filter(Boolean).join(' '),
      animated: edge.animated && !isRuntimeEdge,
    }
  }), [edges, isInLastRunSnapshot, nodeRuntime, runtimeClock])
  const validationIssues = useMemo(() => validateFlow(nodes, edges, entityById, services, activeFlow?.paused), [activeFlow?.paused, edges, entityById, nodes, services])
  const flowSnapshot = useMemo(() => JSON.stringify({ nodes, edges }), [edges, nodes])
  const groupedEntities = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const filtered = entities
      .filter((entity) => {
        if (!normalized) return true
        return [
          entity.entity_id,
          entity.friendlyName,
          entity.areaName,
          entity.deviceType,
          entity.state,
          entity.deviceId,
          entity.attributes?.manufacturer,
          entity.attributes?.model,
        ].some((value) => String(value || '').toLowerCase().includes(normalized))
      })
    const groups = []

    for (const entity of filtered) {
      const areaName = entity.areaName || 'Unassigned'
      const deviceType = entity.deviceType || entity.entity_id.split('.')[0]
      let areaGroup = groups.find((group) => group.areaName === areaName)
      if (!areaGroup) {
        areaGroup = { areaName, types: [] }
        groups.push(areaGroup)
      }

      let typeGroup = areaGroup.types.find((group) => group.deviceType === deviceType)
      if (!typeGroup) {
        typeGroup = { deviceType, entities: [] }
        areaGroup.types.push(typeGroup)
      }

      typeGroup.entities.push(entity)
    }

    return groups.sort((first, second) => first.areaName.localeCompare(second.areaName))
  }, [entities, query])
  const entityAreaNames = useMemo(() => groupedEntities.map((group) => group.areaName), [groupedEntities])
  const isEntitySearchActive = Boolean(query.trim())
  const visibleEntityArea = useMemo(() => {
    if (!groupedEntities.length) return null
    return groupedEntities.find((group) => group.areaName === selectedAreaName) ?? groupedEntities[0]
  }, [groupedEntities, selectedAreaName])
  const visibleEntityAreas = useMemo(() => {
    if (!groupedEntities.length) return []
    if (isEntitySearchActive && selectedAreaName === ALL_ENTITY_AREAS) return groupedEntities
    return visibleEntityArea ? [visibleEntityArea] : []
  }, [groupedEntities, isEntitySearchActive, selectedAreaName, visibleEntityArea])

  const updateHistoryState = useCallback(() => {
    setHistoryState({
      canUndo: historyIndexRef.current > 0,
      canRedo: historyIndexRef.current >= 0 && historyIndexRef.current < historyRef.current.length - 1,
    })
  }, [])

  const resetHistory = useCallback((snapshot) => {
    historyRef.current = [snapshot]
    historyIndexRef.current = 0
    updateHistoryState()
  }, [updateHistoryState])

  useEffect(() => {
    window.localStorage.setItem('haflow-theme', theme)
  }, [theme])

  useEffect(() => {
    window.localStorage.setItem('haflow-inspector-collapsed', String(isInspectorCollapsed))
  }, [isInspectorCollapsed])

  useEffect(() => {
    window.localStorage.setItem('haflow-library-collapsed', String(isLibraryCollapsed))
  }, [isLibraryCollapsed])

  useEffect(() => {
    window.localStorage.setItem('haflow-run-history-collapsed', String(isRunHistoryCollapsed))
  }, [isRunHistoryCollapsed])

  useEffect(() => {
    Promise.all([
      apiFetch('/api/config').then((res) => res.json()),
      apiFetch('/api/logs').then((res) => res.json()),
      apiFetch('/api/runner').then((res) => res.json()),
      apiFetch('/api/flows').then((res) => res.json()),
      apiFetch('/api/run-history').then((res) => res.json()),
    ]).then(async ([config, existingLogs, runnerStatus, flowList, existingHistory]) => {
      const nextActiveFlowId = flowList.activeFlowId ?? 'default'
      const flow = await apiFetch(`/api/flows/${nextActiveFlowId}`).then((res) => res.json())
      setConnection(config)
      setRunner(runnerStatus)
      setFlows(flowList.flows ?? [])
      setActiveFlowId(nextActiveFlowId)
      const nextNodes = flow.nodes ?? []
      const nextEdges = flow.edges ?? []
      const nextViewport = normalizeViewport(flow.viewport)
      setNodes(nextNodes)
      setEdges(nextEdges)
      setViewport(nextViewport)
      viewportRef.current = nextViewport
      window.requestAnimationFrame(() => setReactFlowViewport(nextViewport))
      setSelectedId(null)
      setSelectedNodeIds([])
      setSelectedEdgeId(null)
      setNodeRuntime(normalizeRuntimeSnapshot(runnerStatus.nodeRuntime ?? {}))
      const loadedSnapshot = JSON.stringify({ nodes: nextNodes, edges: nextEdges })
      lastSavedSnapshotRef.current = loadedSnapshot
      resetHistory(loadedSnapshot)
      setSaveStatus('saved')
      setHasLoadedFlow(true)
      setLogs(existingLogs.logs ?? [])
      setRunHistory(existingHistory.history ?? [])
    }).catch(() => {
      setLogs((current) => [{ time: new Date().toISOString(), level: 'warn', message: 'Backend is not reachable yet.' }, ...current])
    })
  }, [resetHistory, setEdges, setNodes, setReactFlowViewport])

  const reloadHomeAssistantData = useCallback(async () => {
    setEntityReloadStatus('loading')
    try {
      const [entityResponse, serviceResponse] = await Promise.all([
        apiFetch('/api/entity-catalog'),
        apiFetch('/api/services'),
      ])
      const [entityData, serviceData] = await Promise.all([
        entityResponse.json(),
        serviceResponse.json(),
      ])
      setEntities((current) => mergeEntityCatalog(current, entityData.entities ?? []))
      setServices(serviceData.services ?? {})
      setEntityReloadStatus('done')
      window.setTimeout(() => setEntityReloadStatus('idle'), 1600)
    } catch {
      setEntityReloadStatus('error')
    }
  }, [])

  useEffect(() => {
    reloadHomeAssistantData()
  }, [connection.connected, reloadHomeAssistantData])

  useEffect(() => {
    const timer = window.setInterval(() => setRuntimeClock(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!entityAreaNames.length) {
      setSelectedAreaName('')
      return
    }

    if (isEntitySearchActive && selectedAreaName === ALL_ENTITY_AREAS) return

    if (!selectedAreaName || selectedAreaName === ALL_ENTITY_AREAS || !entityAreaNames.includes(selectedAreaName)) {
      setSelectedAreaName(entityAreaNames[0])
    }
  }, [entityAreaNames, isEntitySearchActive, selectedAreaName])

  useEffect(() => {
    if (query.trim()) setSelectedAreaName(ALL_ENTITY_AREAS)
  }, [query])

  useEffect(() => {
    if (!hasLastRunSnapshot) setShowLastRunSnapshot(false)
  }, [hasLastRunSnapshot])

  useEffect(() => {
    const socket = new WebSocket(getWebSocketUrl())
    socket.addEventListener('message', (event) => {
      const payload = JSON.parse(event.data)
      if (payload.type === 'log') setLogs((current) => [payload.entry, ...current].slice(0, 160))
      if (payload.type === 'logs-cleared') setLogs([])
      if (payload.type === 'status') setConnection((current) => ({ ...current, ...payload.status }))
      if (payload.type === 'runner') setRunner(payload.runner)
      if (payload.type === 'run-history') setRunHistory(payload.history ?? [])
      if (payload.type === 'entity-state') {
        setEntities((current) => mergeEntityStateUpdate(current, payload.entity))
      }
      if (payload.type === 'node-runtime') {
        setNodeRuntime(normalizeRuntimeSnapshot(payload.runtime ?? {}))
      }
      if (payload.type === 'node-state') {
        const status = normalizeNodeStatus(payload.node.state)
        setNodeRuntime((current) => ({
          ...current,
          [payload.node.id]: {
            ...(current[payload.node.id] ?? {}),
            lastExecutedAt: payload.node.state === 'progress' ? current[payload.node.id]?.lastExecutedAt : payload.node.time,
            delayUntil: payload.node.state === 'progress' ? payload.node.delayUntil : undefined,
            remainingMs: payload.node.state === 'progress' ? payload.node.remainingMs : undefined,
            runId: payload.node.runId,
            status,
          },
        }))
      }
    })
    return () => socket.close()
  }, [])

  const onConnect = useCallback((params) => setEdges((eds) => addEdge({ ...params, animated: true }, eds)), [setEdges])

  const onDrop = useCallback((event) => {
    event.preventDefault()
    const raw = event.dataTransfer.getData('application/haflow-node')
    if (!raw) return
    const item = JSON.parse(raw)
    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY })
    const id = `${item.type}-${createId().slice(0, 8)}`
    setNodes((current) => current.concat({
      id,
      type: 'haflow',
      position,
      data: { ...item.data, kind: item.type },
      style: item.type === 'group' ? { width: 520, height: 320 } : undefined,
    }))
    setSelectedId(id)
    setSelectedNodeIds([id])
    setSelectedEdgeId(null)
  }, [screenToFlowPosition, setNodes])

  const updateNodeData = (patch) => {
    if (!selectedNode) return
    setNodes((current) => current.map((node) => (
      node.id === selectedNode.id ? { ...node, data: { ...node.data, ...patch } } : node
    )))
  }

  const applyEntityToSelected = (entity) => {
    if (!selectedNode) return
    if (isDeviceCatalogItem(entity)) {
      if (selectedNode.data.kind === 'state') {
        let filledCount = 0
        setNodes((current) => {
          const siblingButtons = selectedNode.parentId
            ? current
              .filter((node) => node.parentId === selectedNode.parentId && node.data?.kind === 'state')
              .sort((first, second) => first.position.y - second.position.y)
            : []
          const siblingButtonNumberById = new Map(siblingButtons.map((node, index) => [node.id, LUTRON_5_BUTTON_PICO_ROWS[index]?.number ?? index + 1]))
          return current.map((node) => {
          const shouldFillSelected = node.id === selectedNode.id
          const shouldFillSiblingButton = selectedNode.parentId &&
            node.parentId === selectedNode.parentId &&
            node.data?.kind === 'state' &&
            siblingButtons.length >= 2
          if (!shouldFillSelected && !shouldFillSiblingButton) return node
          filledCount += 1
          return {
            ...node,
            data: {
              ...node.data,
              ...buildDeviceTriggerData(node.data, entity, siblingButtonNumberById.get(node.id)),
            },
          }
          })
        })
        setLogs((current) => [{
          time: new Date().toISOString(),
          level: 'info',
          message: `Selected ${entity.friendlyName || 'device'} for ${filledCount > 1 ? `${filledCount} button triggers` : selectedNode.data.label || 'trigger'}.`,
        }, ...current])
        return
      }
      setLogs((current) => [{
        time: new Date().toISOString(),
        level: 'warn',
        message: `${entity.friendlyName || 'That device'} is a Home Assistant device. Select a Trigger node to use it for Pico button events.`,
      }, ...current])
      return
    }
    if (!isSelectableEntity(entity)) {
      return
    }
    if (selectedNode.data.kind === 'service') {
      const current = selectedNode.data.entityIds ?? []
      const entityIds = current.includes(entity.entity_id)
        ? current.filter((entityId) => entityId !== entity.entity_id)
        : current.concat(entity.entity_id)
      const domains = Array.from(new Set(entityIds.map((id) => id.split('.')[0])))
      const patch = {
        entityIds,
        entityId: entityIds[0] ?? '',
        label: entityIds.length === 0 ? getCatalogLabel(selectedNode.data.kind) : entityIds.length === 1 ? (entities.find((item) => item.entity_id === entityIds[0])?.friendlyName || entityIds[0]) : `${entityIds.length} Actions`,
      }
      if (!entityIds.length) {
        patch.domain = ''
        patch.service = ''
        patch.payload = '{}'
      }
      if (domains.length === 1) {
        patch.domain = domains[0]
        const domainServices = services[domains[0]] ? Object.keys(services[domains[0]]) : []
        if (!domainServices.includes(selectedNode.data.service)) patch.service = getDefaultService(domainServices, selectedNode.data.service)
      }
      updateNodeData(patch)
      return
    }

    if (selectedNode.data.kind === 'state') {
      const currentRules = getStateTriggerRules(selectedNode.data)
      let rules
      if (currentRules.some((rule) => rule.entityId === entity.entity_id)) {
        rules = currentRules.filter((rule) => rule.entityId !== entity.entity_id)
      } else {
        const blankIndex = currentRules.findIndex((rule) => !rule.entityId)
        rules = blankIndex >= 0
          ? currentRules.map((rule, index) => (index === blankIndex ? { ...rule, entityId: entity.entity_id } : rule))
          : currentRules.concat({
            id: createId(),
            entityId: entity.entity_id,
            from: '',
            to: '',
          })
      }
      const selectedRules = rules.filter((rule) => rule.entityId)
      updateNodeData({
        triggers: rules,
        entityId: selectedRules[0]?.entityId ?? '',
        label: selectedRules.length === 1 ? (entity.friendlyName || entity.entity_id) : `${selectedRules.length} Triggers`,
      })
      return
    }

    if (selectedNode.data.kind === 'condition') {
      const currentRules = getConditionRules(selectedNode.data)
      const rules = currentRules.some((rule) => rule.entityId === entity.entity_id)
        ? currentRules.filter((rule) => rule.entityId !== entity.entity_id)
        : currentRules.concat({
          id: createId(),
          entityId: entity.entity_id,
          attribute: 'state',
          operator: 'equals',
          value: '',
        })
      updateNodeData({
        conditionMode: selectedNode.data.conditionMode || 'any',
        conditions: rules,
        entityId: rules[0]?.entityId ?? '',
        label: rules.length === 1 ? (entity.friendlyName || entity.entity_id) : `${rules.length} Conditions`,
      })
      return
    }

    const patch = {
      entityId: entity.entity_id,
      label: entity.friendlyName || entity.entity_id,
    }

    if (['state', 'event'].includes(selectedNode.data.kind) && ['on', 'off'].includes(entity.state) && !selectedNode.data.to) {
      patch.to = 'on'
    }

    updateNodeData(patch)
  }

  const groupSelected = useCallback(() => {
    const selectedNodes = nodes.filter((node) => selectedNodeIdSet.has(node.id) && node.data?.kind !== 'group')
    if (!selectedNodes.length) return
    const bounds = getNodesBoundsForGroup(selectedNodes)
    const id = `group-${createId().slice(0, 8)}`
    const groupNode = createGroupNode({ bounds, id, label: selectedNodes.length === 1 ? 'Subflow' : `${selectedNodes.length} Node Subflow` })
    setNodes((current) => {
      const currentById = new Map(current.map((node) => [node.id, node]))
      return [
        groupNode,
        ...current.map((node) => {
          if (!selectedNodeIdSet.has(node.id) || node.data?.kind === 'group') return node
          const absolute = getAbsoluteNodePosition(node, currentById)
          return {
            ...node,
            parentId: id,
            extent: 'parent',
            position: {
              x: absolute.x - groupNode.position.x,
              y: absolute.y - groupNode.position.y,
            },
          }
        }),
      ]
    })
    setSelectedId(id)
    setSelectedNodeIds([id])
    setSelectedEdgeId(null)
  }, [nodes, selectedNodeIdSet, setNodes])

  const duplicateSelected = useCallback(() => {
    const selection = selectedNodeIds.length ? selectedNodeIds : selectedId ? [selectedId] : []
    if (!selection.length) return
    const selectionSet = expandNodeSelection(nodes, selection)
    const idMap = new Map()
    const nodeById = new Map(nodes.map((node) => [node.id, node]))
    const copiedNodes = nodes
      .filter((node) => selectionSet.has(node.id))
      .map((node) => {
        const id = `${node.data.kind || 'node'}-${createId().slice(0, 8)}`
        idMap.set(node.id, id)
        const parentIsCopied = node.parentId && selectionSet.has(node.parentId)
        const absolute = getAbsoluteNodePosition(node, nodeById)
        return {
          ...node,
          id,
          parentId: parentIsCopied ? idMap.get(node.parentId) : undefined,
          extent: parentIsCopied ? node.extent : undefined,
          selected: true,
          position: {
            x: parentIsCopied ? node.position.x : absolute.x + 34,
            y: parentIsCopied ? node.position.y : absolute.y + 34,
          },
          data: {
            ...node.data,
            label: selection.length === 1 ? `${node.data.label || 'Node'} Copy` : node.data.label,
            runtimeStatus: undefined,
          },
        }
      })
    const copiedEdges = edges
      .filter((edge) => selectionSet.has(edge.source) && selectionSet.has(edge.target))
      .map((edge) => ({
        ...edge,
        id: `${edge.id}-${createId().slice(0, 8)}`,
        source: idMap.get(edge.source),
        target: idMap.get(edge.target),
        selected: false,
      }))
    setNodes((current) => current.concat(copiedNodes))
    setEdges((current) => current.concat(copiedEdges))
    const nextSelection = selection.map((id) => idMap.get(id)).filter(Boolean)
    setSelectedId(nextSelection[0] ?? null)
    setSelectedNodeIds(nextSelection)
    setSelectedEdgeId(null)
  }, [edges, nodes, selectedId, selectedNodeIds, setEdges, setNodes])

  const alignSelectedNodes = useCallback((alignment) => {
    const selectedNodes = nodes.filter((node) => selectedNodeIdSet.has(node.id))
    if (selectedNodes.length < 2) return

    const nodeById = new Map(nodes.map((node) => [node.id, node]))
    const boxes = selectedNodes.map((node) => {
      const absolute = getAbsoluteNodePosition(node, nodeById)
      const size = getNodeSize(node)
      return {
        id: node.id,
        absolute,
        size,
        left: absolute.x,
        right: absolute.x + size.width,
        top: absolute.y,
        bottom: absolute.y + size.height,
      }
    })
    const bounds = {
      left: Math.min(...boxes.map((box) => box.left)),
      right: Math.max(...boxes.map((box) => box.right)),
      top: Math.min(...boxes.map((box) => box.top)),
      bottom: Math.max(...boxes.map((box) => box.bottom)),
    }
    const targetCenterX = bounds.left + ((bounds.right - bounds.left) / 2)
    const targetCenterY = bounds.top + ((bounds.bottom - bounds.top) / 2)
    const boxById = new Map(boxes.map((box) => [box.id, box]))

    setNodes((current) => {
      const currentById = new Map(current.map((node) => [node.id, node]))
      const parentPositionById = new Map()
      const getParentAbsolutePosition = (parentId) => {
        if (!parentId) return { x: 0, y: 0 }
        if (parentPositionById.has(parentId)) return parentPositionById.get(parentId)
        const parent = currentById.get(parentId)
        const absolute = parent ? getAbsoluteNodePosition(parent, currentById) : { x: 0, y: 0 }
        parentPositionById.set(parentId, absolute)
        return absolute
      }

      return current.map((node) => {
        const box = boxById.get(node.id)
        if (!box) return node

        const nextAbsolute = { ...box.absolute }
        if (alignment === 'left') nextAbsolute.x = bounds.left
        if (alignment === 'center-x') nextAbsolute.x = targetCenterX - (box.size.width / 2)
        if (alignment === 'right') nextAbsolute.x = bounds.right - box.size.width
        if (alignment === 'top') nextAbsolute.y = bounds.top
        if (alignment === 'middle-y') nextAbsolute.y = targetCenterY - (box.size.height / 2)
        if (alignment === 'bottom') nextAbsolute.y = bounds.bottom - box.size.height

        const parentAbsolute = getParentAbsolutePosition(node.parentId)
        return {
          ...node,
          position: {
            x: nextAbsolute.x - parentAbsolute.x,
            y: nextAbsolute.y - parentAbsolute.y,
          },
        }
      })
    })
  }, [nodes, selectedNodeIdSet, setNodes])

  const saveFlow = useCallback(async ({ silent = false, nextViewport } = {}) => {
    const viewportToSave = normalizeViewport(nextViewport ?? viewportRef.current ?? getViewport())
    setSaveStatus('saving')
    const response = await apiFetch(`/api/flows/${activeFlowId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodes, edges, viewport: viewportToSave }),
    })
    const result = await response.json()
    lastSavedSnapshotRef.current = JSON.stringify({ nodes, edges })
    viewportRef.current = viewportToSave
    setViewport(viewportToSave)
    setSaveStatus('saved')
    if (!silent) setLogs((current) => [{ time: new Date().toISOString(), level: 'info', message: result.message }, ...current])
  }, [activeFlowId, edges, getViewport, nodes])

  const handleMoveEnd = useCallback((_, nextViewport) => {
    if (!hasLoadedFlow) return
    const normalized = normalizeViewport(nextViewport)
    viewportRef.current = normalized
    setViewport(normalized)
    setSaveStatus('dirty')
    if (viewportSaveTimeoutRef.current) window.clearTimeout(viewportSaveTimeoutRef.current)
    viewportSaveTimeoutRef.current = window.setTimeout(() => {
      saveFlow({ silent: true, nextViewport: normalized }).catch(() => setSaveStatus('error'))
    }, 600)
  }, [hasLoadedFlow, saveFlow])

  const loadFlow = async (flowId) => {
    setHasLoadedFlow(false)
    setSaveStatus('loading')
    if (viewportSaveTimeoutRef.current) window.clearTimeout(viewportSaveTimeoutRef.current)
    const response = await apiFetch(`/api/flows/${flowId}`)
    const flow = await response.json()
    const nextNodes = flow.nodes ?? []
    const nextEdges = flow.edges ?? []
    const nextViewport = normalizeViewport(flow.viewport)
    setActiveFlowId(flowId)
    setNodes(nextNodes)
    setEdges(nextEdges)
    setViewport(nextViewport)
    viewportRef.current = nextViewport
    window.requestAnimationFrame(() => setReactFlowViewport(nextViewport))
    setSelectedId(null)
    setSelectedNodeIds([])
    setSelectedEdgeId(null)
    const runnerStatus = await apiFetch('/api/runner').then((res) => res.json())
    setNodeRuntime(normalizeRuntimeSnapshot(runnerStatus.nodeRuntime ?? {}))
    const loadedSnapshot = JSON.stringify({ nodes: nextNodes, edges: nextEdges })
    lastSavedSnapshotRef.current = loadedSnapshot
    resetHistory(loadedSnapshot)
    setSaveStatus('saved')
    setHasLoadedFlow(true)
  }

  const createFlow = async (duplicate = false) => {
    const name = newFlowName.trim() || (duplicate ? `${activeFlow?.name || 'Flow'} Copy` : 'New Flow')
    const response = await apiFetch('/api/flows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, sourceFlowId: duplicate ? activeFlowId : '' }),
    })
    const result = await response.json()
    setFlows(result.flows ?? [])
    setNewFlowName('')
    await loadFlow(result.flow.id)
  }

  const deleteFlow = async () => {
    if (activeFlowId === 'default') return
    const response = await apiFetch(`/api/flows/${activeFlowId}`, { method: 'DELETE' })
    const result = await response.json()
    setFlows(result.flows ?? [])
    await loadFlow(result.activeFlowId ?? 'default')
  }

  const toggleFlowPaused = async () => {
    const response = await apiFetch(`/api/flows/${activeFlowId}/pause`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paused: !activeFlow?.paused }),
    })
    const result = await response.json()
    setFlows(result.flows ?? [])
    setRunner((current) => ({ ...current, flowPaused: !activeFlow?.paused }))
  }

  const exportFlow = () => {
    const blob = new Blob([JSON.stringify({ nodes, edges, viewport: normalizeViewport(getViewport()) }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `haflow-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const exportBackup = async () => {
    const response = await apiFetch('/api/backup')
    const backup = await response.json()
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `haflow-backup-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const importBackup = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      const backup = JSON.parse(await file.text())
      const response = await apiFetch('/api/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(backup),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Backup import failed.')
      setFlows(result.flows ?? [])
      if (result.importedIds?.[0]) await loadFlow(result.importedIds[0])
      setLogs((current) => [{ time: new Date().toISOString(), level: 'info', message: `Imported ${result.importedIds?.length ?? 0} backup flow${result.importedIds?.length === 1 ? '' : 's'}.` }, ...current])
    } catch (error) {
      setLogs((current) => [{ time: new Date().toISOString(), level: 'error', message: error.message }, ...current])
    }
  }

  const addStarterPack = async () => {
    const response = await apiFetch('/api/starter-pack', { method: 'POST' })
    const result = await response.json()
    if (!response.ok) {
      setLogs((current) => [{ time: new Date().toISOString(), level: 'error', message: result.error || 'Starter pack import failed.' }, ...current])
      return
    }
    setFlows(result.flows ?? [])
    if (result.importedIds?.[0]) await loadFlow(result.importedIds[0])
    setLogs((current) => [{ time: new Date().toISOString(), level: 'info', message: `Added ${result.importedIds?.length ?? 0} Starter flows.` }, ...current])
  }

  const importFlow = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      const flow = JSON.parse(await file.text())
      if (!Array.isArray(flow.nodes) || !Array.isArray(flow.edges)) throw new Error('Flow JSON needs nodes and edges arrays.')
      const nextViewport = normalizeViewport(flow.viewport)
      setNodes(flow.nodes)
      setEdges(flow.edges)
      setViewport(nextViewport)
      viewportRef.current = nextViewport
      window.requestAnimationFrame(() => setReactFlowViewport(nextViewport))
      setSelectedId(null)
      setSelectedNodeIds([])
      setSelectedEdgeId(null)
      setSaveStatus('dirty')
      setLogs((current) => [{ time: new Date().toISOString(), level: 'info', message: `Imported ${file.name}.` }, ...current])
    } catch (error) {
      setLogs((current) => [{ time: new Date().toISOString(), level: 'error', message: error.message }, ...current])
    }
  }

  const runFlow = async ({ fromSelected = false } = {}) => {
    if (activeFlow?.paused) {
      setLogs((current) => [{ time: new Date().toISOString(), level: 'warn', message: `${activeFlow.name} is paused. Resume it before running.` }, ...current])
      return
    }

    if (fromSelected && !selectedId) {
      setLogs((current) => [{ time: new Date().toISOString(), level: 'warn', message: 'Select a node before running from selected.' }, ...current])
      return
    }

    const selectedNodeIssue = fromSelected ? validateNodeData(selectedNode?.data ?? {}, entityById, services) : ''
    if (selectedNodeIssue) {
      setLogs((current) => [{ time: new Date().toISOString(), level: 'warn', message: `${selectedNode?.data?.label || selectedId}: ${selectedNodeIssue}` }, ...current])
      return
    }

    if (!fromSelected && validationIssues.length) {
      setLogs((current) => [{ time: new Date().toISOString(), level: 'warn', message: `Fix ${validationIssues.length} validation issue${validationIssues.length === 1 ? '' : 's'} before running.` }, ...current])
      return
    }

    setNodeRuntime({})
    const response = await apiFetch('/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodes, edges, startNodeId: fromSelected ? selectedId : '' }),
    })
    const result = await response.json()
    setLogs((current) => [{ time: new Date().toISOString(), level: result.ok ? 'info' : 'error', message: result.message }, ...current])
  }

  saveFlowRef.current = saveFlow
  runFlowRef.current = runFlow

  useEffect(() => {
    if (!hasLoadedFlow) return

    if (isApplyingHistoryRef.current) {
      isApplyingHistoryRef.current = false
      updateHistoryState()
      return
    }

    const currentSnapshot = historyRef.current[historyIndexRef.current]
    if (flowSnapshot === currentSnapshot) return

    const nextHistory = historyRef.current.slice(0, historyIndexRef.current + 1).concat(flowSnapshot).slice(-80)
    historyRef.current = nextHistory
    historyIndexRef.current = nextHistory.length - 1
    updateHistoryState()
  }, [flowSnapshot, hasLoadedFlow, updateHistoryState])

  useEffect(() => {
    if (!hasLoadedFlow) return undefined
    if (flowSnapshot === lastSavedSnapshotRef.current) {
      setSaveStatus('saved')
      return undefined
    }

    setSaveStatus('dirty')
    const timeoutId = window.setTimeout(() => {
      saveFlow({ silent: true }).catch(() => setSaveStatus('error'))
    }, 1200)

    return () => window.clearTimeout(timeoutId)
  }, [flowSnapshot, hasLoadedFlow, saveFlow])

  useEffect(() => () => {
    if (viewportSaveTimeoutRef.current) window.clearTimeout(viewportSaveTimeoutRef.current)
  }, [])

  const clearLogs = async () => {
    await apiFetch('/api/logs', { method: 'DELETE' })
    setLogs([])
  }

  const applyHistorySnapshot = useCallback((snapshot) => {
    const flow = JSON.parse(snapshot)
    isApplyingHistoryRef.current = true
    setNodes(flow.nodes ?? [])
    setEdges(flow.edges ?? [])
    setSelectedId(null)
    setSelectedNodeIds([])
  }, [setEdges, setNodes])

  const undoFlow = useCallback(() => {
    if (historyIndexRef.current <= 0) return
    historyIndexRef.current -= 1
    applyHistorySnapshot(historyRef.current[historyIndexRef.current])
    updateHistoryState()
  }, [applyHistorySnapshot, updateHistoryState])

  const redoFlow = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return
    historyIndexRef.current += 1
    applyHistorySnapshot(historyRef.current[historyIndexRef.current])
    updateHistoryState()
  }, [applyHistorySnapshot, updateHistoryState])

  const toggleRunner = async () => {
    if (!runner.enabled && validationIssues.length) {
      setLogs((current) => [{ time: new Date().toISOString(), level: 'warn', message: `Fix ${validationIssues.length} validation issue${validationIssues.length === 1 ? '' : 's'} before enabling the runner.` }, ...current])
      return
    }

    const response = await apiFetch('/api/runner', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !runner.enabled, flow: { nodes, edges, viewport: normalizeViewport(getViewport()) } }),
    })
    const nextRunner = await response.json()
    setRunner(nextRunner)
    setNodeRuntime(normalizeRuntimeSnapshot(nextRunner.nodeRuntime ?? {}))
  }

  const deleteSelected = useCallback(() => {
    if (selectedEdgeId) {
      setEdges((current) => current.filter((edge) => edge.id !== selectedEdgeId))
      setSelectedEdgeId(null)
      return
    }

    const selection = selectedNodeIds.length ? selectedNodeIds : selectedId ? [selectedId] : []
    if (!selection.length) return
    const selectionSet = expandNodeSelection(nodes, selection)
    setNodes((current) => current.filter((node) => !selectionSet.has(node.id)))
    setEdges((current) => current.filter((edge) => !selectionSet.has(edge.source) && !selectionSet.has(edge.target)))
    setSelectedId(null)
    setSelectedNodeIds([])
  }, [nodes, selectedEdgeId, selectedId, selectedNodeIds, setEdges, setNodes])

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (isTypingTarget(event.target)) return

      if ((event.key === 'Delete' || event.key === 'Backspace') && (hasNodeSelection || selectedEdgeId)) {
        event.preventDefault()
        deleteSelected()
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        saveFlowRef.current?.()
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault()
        undoFlow()
      }

      if (
        ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') ||
        ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'z')
      ) {
        event.preventDefault()
        redoFlow()
      }

      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault()
        runFlowRef.current?.()
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd' && hasNodeSelection) {
        event.preventDefault()
        duplicateSelected()
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'g' && hasNodeSelection) {
        event.preventDefault()
        groupSelected()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [deleteSelected, duplicateSelected, groupSelected, hasNodeSelection, redoFlow, selectedEdgeId, undoFlow])

  return (
    <main className={`app-shell theme-${theme} ${isInspectorCollapsed ? 'inspector-is-collapsed' : ''}`}>
      <aside className="palette panel">
        <div className="brand">
          <Cable size={24} />
          <div>
            <h1>HAFlow</h1>
            <span>Ver. {APP_VERSION}</span>
          </div>
        </div>
        <div className="section-title">Flows</div>
        <div className="flow-library">
          <select value={activeFlowId} onChange={(event) => loadFlow(event.target.value)}>
            {sortedFlows.map((flow) => <option key={flow.id} value={flow.id}>{flow.paused ? '[Paused] ' : ''}{flow.name}</option>)}
          </select>
          {activeFlow?.paused ? <div className="flow-paused-badge">Paused</div> : null}
          <input value={newFlowName} onChange={(event) => setNewFlowName(event.target.value)} placeholder="New flow name" />
          <div className="flow-library-actions">
            <button onClick={() => createFlow(false)} title="Create flow" type="button"><FilePlus size={16} /> New</button>
            <button onClick={() => createFlow(true)} title="Duplicate flow" type="button"><Copy size={16} /> Copy</button>
            <button className={activeFlow?.paused ? 'resume-flow' : 'pause-flow'} onClick={toggleFlowPaused} title={activeFlow?.paused ? 'Resume flow' : 'Pause flow'} type="button">
              {activeFlow?.paused ? <Play size={16} /> : <Pause size={16} />}
              {activeFlow?.paused ? 'Resume' : 'Pause'}
            </button>
            <button className="delete-flow" disabled={activeFlowId === 'default'} onClick={deleteFlow} title="Delete flow" type="button"><Trash2 size={16} /></button>
          </div>
        </div>
        <button className="section-title collapsible-section-title" onClick={() => setIsLibraryCollapsed((current) => !current)} type="button">
          <span>Library</span>
          {isLibraryCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
        </button>
        {!isLibraryCollapsed ? (
          <div className="library-actions">
            <button onClick={exportFlow} title="Export current flow" type="button"><Download size={16} /> Export Flow</button>
            <button onClick={() => importRef.current?.click()} title="Import flow into current canvas" type="button"><Upload size={16} /> Import Flow</button>
            <button onClick={exportBackup} title="Export all flows" type="button"><Download size={16} /> Export Backup</button>
            <button onClick={() => backupImportRef.current?.click()} title="Import all-flow backup" type="button"><Upload size={16} /> Import Backup</button>
            <button onClick={addStarterPack} title="Add starter flows" type="button"><FilePlus size={16} /> Starter Pack</button>
          </div>
        ) : null}
        <div className="section-title">Nodes</div>
        <div className="node-palette">
          {nodeCatalog.map((item) => {
            const Icon = item.icon
            return (
              <button
                className="palette-item"
                data-tooltip={item.description}
                draggable
                key={item.type}
                onDragStart={(event) => event.dataTransfer.setData('application/haflow-node', JSON.stringify(item))}
                title={item.description}
                type="button"
              >
                <span style={{ '--node-color': item.color }}><Icon size={17} /></span>
                {item.label}
              </button>
            )
          })}
        </div>
        <section className="connection-panel">
          <div className="section-title">Home Assistant</div>
          <div className="managed-connection">
            <Check size={17} />
            <div>
              <strong>{connection.connected ? 'Connected' : 'Connecting'}</strong>
              <span>Managed by Home Assistant</span>
            </div>
          </div>
          <button className="secondary-action" disabled={entityReloadStatus === 'loading'} onClick={reloadHomeAssistantData} type="button">
            <RefreshCw className={entityReloadStatus === 'loading' ? 'spin-icon' : ''} size={16} />
            {entityReloadStatus === 'loading' ? 'Reloading Entities' : entityReloadStatus === 'done' ? 'Entities Reloaded' : 'Reload Entities'}
          </button>
          <div className="ha-stats">
            <span>{entities.length || connection.entityCount} entities</span>
            <span>{Object.keys(services).length || connection.serviceCount} domains</span>
          </div>
        </section>
        <div className={`runner-card ${runner.enabled ? 'enabled' : ''}`}>
          <div>
            <strong>{activeFlow?.paused ? 'Flow paused' : runner.enabled ? 'Runner enabled' : 'Runner paused'}</strong>
            <span>{activeFlow?.paused ? 'Will not run' : `${runner.triggerCount} triggers · ${runner.running} running`}</span>
          </div>
          <span>{activeFlow?.paused ? 'Resume this flow to allow manual or automatic runs' : runner.connected ? 'HA stream online' : 'HA stream idle'}</span>
        </div>
        <section className="compact-log-panel">
          <div className="section-title section-title-row">
            <span>Run Log</span>
            <button onClick={clearLogs} title="Clear run log" type="button"><Trash2 size={14} /></button>
          </div>
          <button className="compact-log-window" onClick={() => setIsLogModalOpen(true)} type="button">
            {logs.length ? logs.slice(0, 10).map((log, index) => (
              <div className={`log-line ${log.level}`} key={`${log.time}-${index}`}>
                <span>{new Date(log.time).toLocaleTimeString()}</span>
                <p>{log.message}</p>
              </div>
            )) : <div className="log-empty">No log entries yet</div>}
          </button>
        </section>
      </aside>

      <section className="canvas-panel" ref={wrapperRef}>
        <header className="toolbar">
          <div className="toolbar-main">
            <div className="toolbar-title-row">
              <strong>{activeFlow?.name || 'Automation canvas'}</strong>
              <span>{nodes.length} nodes, {edges.length} links, {validationIssues.length} errors · Last Triggered: {lastTriggeredAt ? formatNodeRunTime(lastTriggeredAt) : 'Never'}</span>
            </div>
            <span className="shortcut-hint">Ctrl+Z undo · Ctrl+S save · Ctrl+Enter run · Ctrl+D duplicate · Ctrl+G group</span>
          </div>
          <div className="toolbar-control-row">
            <div className={`save-status ${saveStatus}`}>
              {saveStatus === 'saving' ? 'Saving' : saveStatus === 'dirty' ? 'Unsaved' : saveStatus === 'error' ? 'Save failed' : saveStatus === 'loading' ? 'Loading' : 'Saved'}
            </div>
            <div className="toolbar-actions">
              <button onClick={undoFlow} disabled={!historyState.canUndo} title="Undo" type="button"><Undo2 size={18} /></button>
              <button onClick={redoFlow} disabled={!historyState.canRedo} title="Redo" type="button"><Redo2 size={18} /></button>
              <button onClick={saveFlow} title="Save flow" type="button"><Save size={18} /></button>
              <button onClick={() => runFlow()} title="Run full flow" type="button"><Play size={18} /></button>
              <button onClick={() => runFlow({ fromSelected: true })} disabled={!selectedId} title="Run from selected node" type="button"><SquarePlay size={18} /></button>
              <button onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))} title={`Switch to ${isDarkTheme ? 'light' : 'dark'} mode`} type="button">
                {isDarkTheme ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              <button className={showLastRunSnapshot ? 'is-active' : ''} onClick={() => setShowLastRunSnapshot((current) => !current)} disabled={!hasLastRunSnapshot} title="Show last run snapshot" type="button"><History size={18} /></button>
              <button className={runner.enabled ? 'is-active' : ''} onClick={toggleRunner} title="Toggle automatic runner" type="button"><Power size={18} /></button>
              <button onClick={groupSelected} disabled={!hasNodeSelection} title="Group selected" type="button"><ListTree size={18} /></button>
              <button onClick={duplicateSelected} disabled={!hasNodeSelection} title="Duplicate selected" type="button"><Copy size={18} /></button>
              <button onClick={deleteSelected} disabled={!hasNodeSelection && !selectedEdgeId} title="Delete selected" type="button"><Trash2 size={18} /></button>
            </div>
          </div>
          {selectedNodeIds.length > 1 ? (
            <div className="toolbar-align-row" aria-label="Align selected nodes">
              <button onClick={() => alignSelectedNodes('left')} title="Align left" type="button"><AlignHorizontalJustifyStart size={17} /></button>
              <button onClick={() => alignSelectedNodes('center-x')} title="Align center" type="button"><AlignHorizontalJustifyCenter size={17} /></button>
              <button onClick={() => alignSelectedNodes('right')} title="Align right" type="button"><AlignHorizontalJustifyEnd size={17} /></button>
              <button onClick={() => alignSelectedNodes('top')} title="Align top" type="button"><AlignVerticalJustifyStart size={17} /></button>
              <button onClick={() => alignSelectedNodes('middle-y')} title="Align middle" type="button"><AlignVerticalJustifyCenter size={17} /></button>
              <button onClick={() => alignSelectedNodes('bottom')} title="Align bottom" type="button"><AlignVerticalJustifyEnd size={17} /></button>
            </div>
          ) : null}
          <input accept="application/json" className="hidden-input" onChange={importFlow} ref={importRef} type="file" />
          <input accept="application/json" className="hidden-input" onChange={importBackup} ref={backupImportRef} type="file" />
        </header>
        <div className="flow-surface" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
          <ReactFlow
            nodes={displayNodes}
            edges={displayEdges}
            nodeTypes={nodeTypes}
            onConnect={onConnect}
            onEdgesChange={onEdgesChange}
            onNodesChange={onNodesChange}
            onEdgeClick={(_, edge) => {
              setSelectedEdgeId(edge.id)
              setSelectedId(null)
              setSelectedNodeIds([])
            }}
            onNodeClick={(event, node) => {
              if (event.shiftKey) {
                setSelectedEdgeId(null)
                setSelectedNodeIds((current) => {
                  if (current.includes(node.id)) return current.filter((id) => id !== node.id)
                  return current.concat(node.id)
                })
                setSelectedId((current) => (current === node.id ? null : node.id))
                return
              }
              setSelectedId(node.id)
              setSelectedNodeIds([node.id])
              setSelectedEdgeId(null)
            }}
            onPaneClick={() => {
              setSelectedId(null)
              setSelectedNodeIds([])
              setSelectedEdgeId(null)
            }}
            onMoveEnd={handleMoveEnd}
            defaultViewport={viewport}
          >
            <Background color={isDarkTheme ? '#334155' : '#cbd5e1'} gap={24} size={1.2} />
            <MiniMap
              bgColor={isDarkTheme ? '#111827' : '#ffffff'}
              maskColor={isDarkTheme ? 'rgba(15, 23, 42, 0.72)' : 'rgba(238, 242, 246, 0.72)'}
              nodeColor={getMiniMapNodeColor}
              nodeStrokeColor={getMiniMapNodeStrokeColor}
              nodeStrokeWidth={(node) => (node.selected || node.data?.runtimeStatus ? 6 : 4)}
              pannable
              zoomable
            />
            <Controls />
          </ReactFlow>
          {flowDeviceStatuses.length ? (
            <aside className="flow-device-status" aria-label="Flow device statuses">
              <div className="flow-device-status-header">
                <strong>Devices</strong>
                <span>{flowDeviceStatuses.length}</span>
              </div>
              <div className="flow-device-status-list">
                {flowDeviceStatuses.map((item) => (
                  <div className="flow-device-status-item" key={item.entityId} title={item.entityId}>
                    <span>{item.name}</span>
                    <strong className={getFlowEntityStatusClass(item.state)}>{item.stateLabel}</strong>
                  </div>
                ))}
              </div>
            </aside>
          ) : null}
        </div>
      </section>

      {isInspectorCollapsed ? (
        <button className="inspector-reopen" onClick={() => setIsInspectorCollapsed(false)} title="Show inspector" type="button">
          <PanelRightOpen size={18} />
          <span>Inspector</span>
        </button>
      ) : null}

      <aside className="inspector panel" aria-hidden={isInspectorCollapsed}>
        <div className="tabs">
          <span><Settings size={16} /> Inspector</span>
          <button className="inspector-hide-button" onClick={() => setIsInspectorCollapsed(true)} title="Hide inspector" type="button">
            <PanelRightClose size={17} />
            <span>Hide</span>
          </button>
        </div>
        <div className="inspector-scroll">
          {selectedNode ? (
            <Inspector entities={entities} node={selectedNode} services={services} updateNodeData={updateNodeData} />
          ) : (
            <div className="empty-state">
              <Split size={30} />
              <p>Select a node to edit its Home Assistant behavior.</p>
            </div>
          )}
          <div className="section-title">Validation</div>
          <div className="validation-list">
            {validationIssues.length ? validationIssues.slice(0, 8).map((issue, index) => (
              <div className="validation-item" key={`${issue}-${index}`}><AlertTriangle size={14} /> {issue}</div>
            )) : <div className="validation-ok"><Check size={14} /> Flow looks ready</div>}
          </div>
          <button className="section-title collapsible-section-title" onClick={() => setIsRunHistoryCollapsed((current) => !current)} type="button">
            <span>Run History</span>
            {isRunHistoryCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
          </button>
          {!isRunHistoryCollapsed ? (
            <div className="run-history-list">
              {runHistory.length ? runHistory.slice(0, 10).map((entry) => (
                <div className={`run-history-item ${entry.status}`} key={entry.id}>
                  <div>
                    <strong>{entry.status === 'completed' ? 'Completed' : entry.status === 'cancelled' ? 'Cancelled' : 'Failed'}</strong>
                    <span>{formatNodeRunTime(entry.startedAt)} · {formatDuration(entry.durationMs)}</span>
                  </div>
                  <p>{entry.trigger}</p>
                  <small>{entry.nodes?.length ? `${entry.nodes.length} node${entry.nodes.length === 1 ? '' : 's'} touched` : 'No nodes touched'}{entry.message ? ` · ${entry.message}` : ''}</small>
                </div>
              )) : <div className="empty-state compact"><History size={24} /><p>No runs yet.</p></div>}
            </div>
          ) : null}
          <div className="section-title">Entities</div>
          <div className="search-box">
            <Search size={15} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter entity ids" />
          </div>
          <select className="entity-area-select" value={isEntitySearchActive && selectedAreaName === ALL_ENTITY_AREAS ? ALL_ENTITY_AREAS : (visibleEntityArea?.areaName ?? '')} onChange={(event) => setSelectedAreaName(event.target.value)}>
            {isEntitySearchActive ? <option value={ALL_ENTITY_AREAS}>All matching areas</option> : null}
            {groupedEntities.map((areaGroup) => (
              <option key={areaGroup.areaName} value={areaGroup.areaName}>{areaGroup.areaName}</option>
            ))}
          </select>
          <div className="entity-list">
            {visibleEntityAreas.length ? (
              visibleEntityAreas.map((areaGroup) => (
                <section className="entity-area-group" key={areaGroup.areaName}>
                  {selectedAreaName === ALL_ENTITY_AREAS ? <div className="entity-area-heading">{areaGroup.areaName}</div> : null}
                  {areaGroup.types.map((typeGroup) => (
                    <div className="entity-type-group" key={`${areaGroup.areaName}-${typeGroup.deviceType}`}>
                      <div className="entity-type-heading">{typeGroup.deviceType}</div>
                      {typeGroup.entities.map((entity) => (
                        <button className={isSelectableEntity(entity) && isEntitySelected(selectedNode, entity.entity_id) ? 'selected' : ''} key={entity.entity_id} onClick={() => applyEntityToSelected(entity)} type="button">
                          <strong>{entity.friendlyName || entity.entity_id}</strong>
                          <span>{getCatalogItemSubtitle(entity)}</span>
                          <small>{getCatalogItemDetail(entity)}</small>
                        </button>
                      ))}
                    </div>
                  ))}
                </section>
              ))
            ) : (
              <div className="entity-empty">No matching entities</div>
            )}
          </div>
        </div>
      </aside>

      {isLogModalOpen ? (
        <div className="log-modal-backdrop" onMouseDown={() => setIsLogModalOpen(false)}>
          <section className="log-modal" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <strong>Run Log</strong>
                <span>{filteredLogs.length} of {logs.length} entries · live</span>
              </div>
              <div className="log-modal-actions">
                <button onClick={clearLogs} title="Clear run log" type="button"><Trash2 size={16} /></button>
                <button onClick={() => setIsLogModalOpen(false)} title="Close run log" type="button"><X size={18} /></button>
              </div>
            </header>
            <label className="log-modal-search">
              <Search size={16} />
              <input value={logQuery} onChange={(event) => setLogQuery(event.target.value)} placeholder="Search run log" />
            </label>
            <div className="log-modal-list">
              {filteredLogs.length ? filteredLogs.map((log, index) => (
                <div className={`log-line ${log.level}`} key={`${log.time}-${index}`}>
                  <span>{new Date(log.time).toLocaleTimeString()}</span>
                  <p>{log.message}</p>
                </div>
              )) : <div className="log-empty">{logs.length ? 'No matching log entries' : 'No log entries yet'}</div>}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  )
}

function EntityInput({ entities, placeholder, value, onChange }) {
  const selectableEntities = entities.filter(isSelectableEntity)
  return (
    <select onChange={(event) => onChange(event.target.value)} value={value ?? ''}>
      <option value="">{placeholder}</option>
      {selectableEntities.map((entity) => (
        <option key={entity.entity_id} value={entity.entity_id}>
          {entity.areaName || 'Unassigned'} / {entity.deviceType || 'Entity'} / {entity.friendlyName || entity.entity_id}
        </option>
      ))}
    </select>
  )
}

function SelectedEntityChip({ entity, entityId, onRemove }) {
  if (!entityId) return null
  return (
    <div className="selected-entities selected-entities-compact">
      <button onClick={onRemove} title="Remove entity" type="button">
        <span>{entity?.friendlyName || entityId}</span>
        <small>{entityId}</small>
        <X size={14} />
      </button>
    </div>
  )
}

function ValueSelect({ entity, options, placeholder, value, onChange }) {
  const normalizedOptions = normalizeControlOptions(options, entity)
  const currentValue = formatAttributeInput(value)
  const hasCurrentValue = currentValue && !normalizedOptions.some((option) => option.value === currentValue)

  if (!normalizedOptions.length) {
    return <input onChange={(event) => onChange(event.target.value)} placeholder={placeholder} value={value ?? ''} />
  }

  return (
    <select onChange={(event) => onChange(event.target.value)} value={currentValue}>
      <option value="">{placeholder}</option>
      {hasCurrentValue && <option value={currentValue}>{formatStateOption(currentValue, entity)}</option>}
      {normalizedOptions.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  )
}

function StateValueSelect({ entity, options, placeholder, value, onChange }) {
  const cleanOptions = options.filter((option) => option !== ANY_CHANGE)
  return (
    <select onChange={(event) => onChange(event.target.value)} value={value ?? ''}>
      <option value="">{placeholder}</option>
      <option value={ANY_CHANGE}>Changed</option>
      {cleanOptions.map((option) => (
        <option key={option} value={option}>{formatStateOption(option, entity)}</option>
      ))}
    </select>
  )
}

function Inspector({ entities, node, services, updateNodeData }) {
  const data = node.data
  const selectedEntity = entities.find((entity) => entity.entity_id === data.entityId)
  const [stateOptions, setStateOptions] = useState([])
  const selectedActionEntities = useMemo(() => {
    return (data.entityIds ?? []).map((entityId) => entities.find((entity) => entity.entity_id === entityId)).filter(Boolean)
  }, [data.entityIds, entities])
  const sharedAttributes = useMemo(() => getSharedAttributes(selectedActionEntities), [selectedActionEntities])
  const selectedEntityAttributes = useMemo(() => getEntityAttributes(selectedEntity), [selectedEntity])
  const compareTargetOptions = useMemo(() => ['state', ...selectedEntityAttributes.map((attribute) => attribute.key)], [selectedEntityAttributes])
  const compareValueOptions = useMemo(() => {
    const selectedAttribute = selectedEntityAttributes.find((attribute) => attribute.key === data.attribute)
    return getAttributeValueOptions(selectedAttribute, stateOptions, selectedEntity, data.value, data.to)
  }, [data.attribute, data.to, data.value, selectedEntity, selectedEntityAttributes, stateOptions])
  const nodeStateOptions = useMemo(() => {
    return Array.from(new Set([...stateOptions, data.from, data.to].filter(Boolean)))
  }, [data.from, data.to, stateOptions])
  const domainOptions = Object.keys(services).sort()
  const serviceNames = data.domain && services[data.domain] ? Object.keys(services[data.domain]).sort() : []

  useEffect(() => {
    let cancelled = false
    const fallbackOptions = selectedEntity?.valueOptions ?? []
    setStateOptions(fallbackOptions)

    if (!data.entityId) return undefined

    apiFetch(`/api/entity-values/${encodeURIComponent(data.entityId)}`)
      .then((res) => res.json())
      .then((result) => {
        if (!cancelled) setStateOptions(result.values ?? fallbackOptions)
      })
      .catch(() => {
        if (!cancelled) setStateOptions(fallbackOptions)
      })

    return () => {
      cancelled = true
    }
  }, [data.entityId, selectedEntity])
  const updateEntity = (entityId) => {
    const entity = entities.find((item) => item.entity_id === entityId)
    if (data.kind === 'service') {
      const current = data.entityIds ?? []
      const entityIds = current.includes(entityId) ? current : current.concat(entityId)
      const domains = Array.from(new Set(entityIds.map((id) => id.split('.')[0])))
      const patch = { entityIds }
      if (domains.length === 1) {
        patch.domain = domains[0]
        const domainServices = services[domains[0]] ? Object.keys(services[domains[0]]) : []
        if (!domainServices.includes(data.service)) patch.service = getDefaultService(domainServices, data.service)
      }
      updateNodeData(patch)
      return
    }

    const patch = { entityId }
    if (['state', 'event'].includes(data.kind) && entity && ['on', 'off'].includes(entity.state) && !data.to) patch.to = 'on'
    updateNodeData(patch)
  }
  const clearEntity = () => {
    if (data.kind === 'event') updateNodeData({ entityId: '', from: '', to: '', label: getCatalogLabel(data.kind) })
    else updateNodeData({ entityId: '', attribute: 'state', to: '', value: '', label: getCatalogLabel(data.kind) })
  }

  return (
    <div className="inspector-fields">
      <label className="toggle-field">
        <input checked={!data.disabled} onChange={(event) => updateNodeData({ disabled: !event.target.checked })} type="checkbox" />
        Enabled
      </label>
      <label>
        Label
        <input value={data.label ?? ''} onChange={(event) => updateNodeData({ label: event.target.value })} />
      </label>
      {['scene', 'service', 'wait'].includes(data.kind) && (
        <>
          <label>
            {data.kind === 'service' ? 'Entities (choose from list or search and select from Entities below)' : 'Entity (choose from list or search and select from Entities below)'}
            <EntityInput entities={data.kind === 'scene' ? entities.filter((entity) => entity.domain === 'scene') : entities} onChange={updateEntity} placeholder={data.kind === 'service' ? 'Add entity' : 'Select entity'} value={data.entityId} />
          </label>
          {data.kind !== 'service' && <SelectedEntityChip entity={selectedEntity} entityId={data.entityId} onRemove={clearEntity} />}
        </>
      )}
      {data.kind === 'service' && (
        <div className="selected-entities">
          <p>Click entities in the list to add or remove them.</p>
          {(data.entityIds ?? []).map((entityId) => {
            const entity = entities.find((item) => item.entity_id === entityId)
            return (
              <button
                key={entityId}
                onClick={() => {
                  const entityIds = (data.entityIds ?? []).filter((item) => item !== entityId)
                  updateNodeData(entityIds.length ? {
                    entityIds,
                    entityId: entityIds[0],
                    label: entityIds.length === 1 ? (entities.find((item) => item.entity_id === entityIds[0])?.friendlyName || entityIds[0]) : `${entityIds.length} Actions`,
                  } : {
                    entityIds: [],
                    entityId: '',
                    label: getCatalogLabel(data.kind),
                    domain: '',
                    service: '',
                    payload: '{}',
                  })
                }}
                title="Remove entity"
                type="button"
              >
                <span>{entity?.friendlyName || entityId}</span>
                <small>{entityId}</small>
                <X size={14} />
              </button>
            )
          })}
        </div>
      )}
      {data.kind === 'state' && (
        <StateTriggerRulesEditor data={data} entities={entities} updateNodeData={updateNodeData} />
      )}
      {data.kind === 'event' && (
        <>
          <label>Event type<input value={data.eventType ?? ''} onChange={(event) => updateNodeData({ eventType: event.target.value })} /></label>
          {data.eventType === 'state_changed' && (
            <>
              <label>Entity (choose from list or search and select from Entities below)<EntityInput entities={entities} onChange={updateEntity} placeholder="Select entity" value={data.entityId} /></label>
              <SelectedEntityChip entity={selectedEntity} entityId={data.entityId} onRemove={clearEntity} />
              <div className="field-grid">
                <label>From<StateValueSelect entity={selectedEntity} onChange={(from) => updateNodeData({ from })} options={nodeStateOptions} placeholder="optional" value={data.from} /></label>
                <label>To<StateValueSelect entity={selectedEntity} onChange={(to) => updateNodeData({ to })} options={nodeStateOptions} placeholder="optional" value={data.to} /></label>
              </div>
            </>
          )}
        </>
      )}
      {data.kind === 'time' && (
        <label>At<input value={data.at ?? ''} onChange={(event) => updateNodeData({ at: event.target.value })} type="time" /></label>
      )}
      {data.kind === 'condition' && (
        <ConditionRulesEditor data={data} entities={entities} updateNodeData={updateNodeData} />
      )}
      {data.kind === 'delay' && (
        <label>Seconds<input min="0" value={data.seconds ?? 0} onChange={(event) => updateNodeData({ seconds: Number(event.target.value) })} type="number" /></label>
      )}
      {data.kind === 'wait' && (
        <>
          <label>
            Attribute
            <select value={data.attribute ?? 'state'} onChange={(event) => updateNodeData({ attribute: event.target.value, to: '' })}>
              {compareTargetOptions.map((option) => <option key={option} value={option}>{formatAttributeName(option)}</option>)}
            </select>
          </label>
          <div className="field-grid">
          <label>Until<ValueSelect entity={(data.attribute ?? 'state') === 'state' ? selectedEntity : undefined} onChange={(to) => updateNodeData({ to })} options={compareValueOptions} placeholder="Select value" value={data.to} /></label>
          <label>Timeout<input min="0" value={data.timeoutSeconds ?? 300} onChange={(event) => updateNodeData({ timeoutSeconds: Number(event.target.value) })} type="number" /></label>
        </div>
        </>
      )}
      {data.kind === 'service' && (
        <>
          <div className="field-grid">
            <label>
              Domain
              <ValueSelect onChange={(domain) => updateNodeData({ domain, service: getDefaultService(Object.keys(services[domain] ?? {}), data.service) })} options={domainOptions} placeholder="Select domain" value={data.domain} />
            </label>
            <label>
              Service
              <select value={data.service ?? ''} onChange={(event) => updateNodeData({ service: event.target.value })}>
                <option value="">Select service</option>
                {serviceNames.map((name) => <option key={name} value={name}>{formatAttributeName(name)}</option>)}
              </select>
            </label>
          </div>
          <SharedAttributes attributes={sharedAttributes} payload={data.payload} updateNodeData={updateNodeData} />
          <label>JSON payload<textarea value={data.payload ?? '{}'} onChange={(event) => updateNodeData({ payload: event.target.value })} spellCheck="false" /></label>
        </>
      )}
      {data.kind === 'notify' && (
        <>
          <label>Message<input value={data.message ?? ''} onChange={(event) => updateNodeData({ message: event.target.value })} /></label>
          <label>Target<input value={data.target ?? ''} onChange={(event) => updateNodeData({ target: event.target.value })} placeholder="notify.mobile_app_phone" /></label>
        </>
      )}
      {data.kind === 'debug' && (
        <label>Message<input value={data.message ?? ''} onChange={(event) => updateNodeData({ message: event.target.value })} /></label>
      )}
    </div>
  )
}

function formatStateOption(option, entity) {
  if (option === ANY_CHANGE) return 'Changed'
  const rawValue = String(option)
  const stateLabels = getStateLabelMap(entity)
  const mappedLabel = stateLabels?.[rawValue.toLowerCase()]
  if (mappedLabel) return mappedLabel
  return String(option).replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function normalizeControlOptions(options, entity) {
  return options.map((option) => {
    if (option && typeof option === 'object' && 'value' in option) {
      const value = formatAttributeInput(option.value)
      return { value, label: option.label ?? formatStateOption(value, entity) }
    }
    const value = formatAttributeInput(option)
    return { value, label: formatStateOption(value, entity) }
  })
}

function getDefaultService(serviceNames, fallback = '') {
  if (!serviceNames.length) return fallback
  if (serviceNames.includes(fallback)) return fallback
  if (serviceNames.includes('turn_on')) return 'turn_on'
  if (serviceNames.includes('set_value')) return 'set_value'
  if (serviceNames.includes('open_cover')) return 'open_cover'
  if (serviceNames.includes('lock')) return 'lock'
  return serviceNames[0]
}

function StateTriggerRulesEditor({ data, entities, updateNodeData }) {
  const emptyRuleId = useRef(createId())
  const editableRules = useMemo(() => {
    const rules = getStateTriggerRules(data)
    return rules.length ? rules : [{ id: emptyRuleId.current, entityId: '', from: '', to: '' }]
  }, [data])
  const [ruleStateOptions, setRuleStateOptions] = useState({})

  useEffect(() => {
    let cancelled = false
    const entityIds = Array.from(new Set(editableRules
      .map((rule) => rule.entityId)
      .filter((entityId) => entities.find((item) => item.entity_id === entityId)?.catalogType !== 'device')))

    Promise.all(entityIds.map(async (entityId) => {
      const entity = entities.find((item) => item.entity_id === entityId)
      const fallbackOptions = entity?.valueOptions ?? []
      try {
        const response = await apiFetch(`/api/entity-values/${encodeURIComponent(entityId)}`)
        const result = await response.json()
        return [entityId, result.values ?? fallbackOptions]
      } catch {
        return [entityId, fallbackOptions]
      }
    })).then((entries) => {
      if (!cancelled) setRuleStateOptions(Object.fromEntries(entries))
    })

    return () => {
      cancelled = true
    }
  }, [editableRules, entities])

  const commitRules = (nextRules) => {
    const selectedRules = nextRules.filter((rule) => rule.entityId || rule.deviceId)
    const firstEntity = entities.find((entity) => entity.entity_id === selectedRules[0]?.entityId)
    updateNodeData({
      triggers: nextRules,
      entityId: selectedRules[0]?.entityId ?? '',
      deviceId: selectedRules[0]?.deviceId ?? '',
      from: selectedRules[0]?.from ?? '',
      to: selectedRules[0]?.to ?? '',
      label: selectedRules.length === 0 ? getCatalogLabel('state') : selectedRules.length === 1 ? (firstEntity?.friendlyName || selectedRules[0].entityId) : `${selectedRules.length} Triggers`,
    })
  }

  const updateRule = (index, patch) => {
    commitRules(editableRules.map((rule, ruleIndex) => (
      ruleIndex === index ? { ...rule, ...patch } : rule
    )))
  }

  const addRule = () => {
    commitRules(editableRules.concat({
      id: createId(),
      entityId: '',
      from: '',
      to: '',
    }))
  }

  const removeRule = (index) => {
    if (editableRules.length === 1) {
      commitRules([{
        id: editableRules[index]?.id ?? emptyRuleId.current,
        entityId: '',
        from: '',
        to: '',
      }])
      return
    }
    commitRules(editableRules.filter((_, ruleIndex) => ruleIndex !== index))
  }

  return (
    <div className="condition-rules">
      {editableRules.map((rule, index) => {
        const entity = entities.find((item) => item.entity_id === rule.entityId)
        const stateOptions = Array.from(new Set([...(ruleStateOptions[rule.entityId] ?? entity?.valueOptions ?? []), rule.from, rule.to].filter(Boolean)))

        return (
          <div className="condition-rule" key={rule.id ?? `${rule.entityId}-${index}`}>
            <label className="condition-rule-entity">
              Entity (choose from list or search and select from Entities below)
              <EntityInput entities={entities} onChange={(entityId) => updateRule(index, { entityId, deviceId: '', from: '', to: '' })} placeholder="Select entity" value={isSelectableEntity(entity) ? rule.entityId : ''} />
            </label>
            <SelectedEntityChip
              entity={entity}
              entityId={rule.entityId}
              onRemove={() => updateRule(index, { entityId: '', deviceId: '', from: '', to: '' })}
            />
            <div className="trigger-rule-values">
              <label>From<StateValueSelect entity={entity} onChange={(from) => updateRule(index, { from })} options={stateOptions} placeholder="optional" value={rule.from} /></label>
              <label>To<StateValueSelect entity={entity} onChange={(to) => updateRule(index, { to })} options={stateOptions} placeholder="optional" value={rule.to} /></label>
              {editableRules.length > 1 && (
                <button className="condition-rule-remove icon-only" onClick={() => removeRule(index)} title="Remove trigger" type="button">
                  <X size={16} />
                </button>
              )}
            </div>
          </div>
        )
      })}
      <button className="secondary-action condition-rule-add" onClick={addRule} type="button">Add Trigger</button>
    </div>
  )
}

function ConditionRulesEditor({ data, entities, updateNodeData }) {
  const emptyRuleId = useRef(createId())
  const editableRules = useMemo(() => {
    const rules = getConditionRules(data)
    return rules.length ? rules : [{ id: emptyRuleId.current, entityId: '', attribute: 'state', operator: 'equals', value: '' }]
  }, [data])
  const [ruleStateOptions, setRuleStateOptions] = useState({})

  useEffect(() => {
    let cancelled = false
    const entityIds = Array.from(new Set(editableRules.map((rule) => rule.entityId).filter(Boolean)))

    Promise.all(entityIds.map(async (entityId) => {
      const entity = entities.find((item) => item.entity_id === entityId)
      const fallbackOptions = entity?.valueOptions ?? []
      try {
        const response = await apiFetch(`/api/entity-values/${encodeURIComponent(entityId)}`)
        const result = await response.json()
        return [entityId, result.values ?? fallbackOptions]
      } catch {
        return [entityId, fallbackOptions]
      }
    })).then((entries) => {
      if (!cancelled) setRuleStateOptions(Object.fromEntries(entries))
    })

    return () => {
      cancelled = true
    }
  }, [editableRules, entities])

  const commitRules = (nextRules) => {
    const selectedRules = nextRules.filter((rule) => rule.entityId)
    const firstEntity = entities.find((entity) => entity.entity_id === selectedRules[0]?.entityId)
    updateNodeData({
      conditionMode: data.conditionMode || 'any',
      conditions: nextRules,
      entityId: selectedRules[0]?.entityId ?? '',
      attribute: selectedRules[0]?.attribute ?? 'state',
      operator: selectedRules[0]?.operator ?? 'equals',
      value: selectedRules[0]?.value ?? '',
      label: selectedRules.length === 0 ? getCatalogLabel('condition') : selectedRules.length === 1 ? (firstEntity?.friendlyName || selectedRules[0].entityId) : `${selectedRules.length} Conditions`,
    })
  }

  const updateRule = (index, patch) => {
    commitRules(editableRules.map((rule, ruleIndex) => {
      if (ruleIndex !== index) return rule
      const nextRule = { ...rule, ...patch }
      if ('entityId' in patch) {
        nextRule.attribute = 'state'
        nextRule.value = ''
      }
      if ('attribute' in patch) nextRule.value = ''
      return nextRule
    }))
  }

  const addRule = () => {
    commitRules(editableRules.concat({
      id: createId(),
      entityId: '',
      attribute: 'state',
      operator: 'equals',
      value: '',
    }))
  }

  const removeRule = (index) => {
    if (editableRules.length === 1) {
      commitRules([{
        id: editableRules[index]?.id ?? emptyRuleId.current,
        entityId: '',
        attribute: 'state',
        operator: 'equals',
        value: '',
      }])
      return
    }
    commitRules(editableRules.filter((_, ruleIndex) => ruleIndex !== index))
  }

  return (
    <div className="condition-rules">
      <label>
        Match
        <select value={data.conditionMode ?? 'any'} onChange={(event) => updateNodeData({ conditionMode: event.target.value, conditions: editableRules })}>
          <option value="any">Any condition is true (OR)</option>
          <option value="all">All conditions are true (AND)</option>
        </select>
      </label>
      {editableRules.map((rule, index) => {
        const entity = entities.find((item) => item.entity_id === rule.entityId)
        const entityAttributes = getEntityAttributes(entity)
        const attributes = ['state', ...entityAttributes.map((attribute) => attribute.key)]
        const selectedAttribute = entityAttributes.find((attribute) => attribute.key === rule.attribute)
        const stateOptions = ruleStateOptions[rule.entityId] ?? entity?.valueOptions ?? []
        const valueOptions = getAttributeValueOptions(selectedAttribute, stateOptions, entity, rule.value)

        return (
          <div className="condition-rule" key={rule.id ?? `${rule.entityId}-${index}`}>
            <div className="condition-rule-header">
              <span>Condition {index + 1}</span>
              <button className="condition-rule-remove icon-only" onClick={() => removeRule(index)} title="Remove condition" type="button">
                <X size={16} />
              </button>
            </div>
            <label className="condition-rule-entity">
              Entity (choose from list or search and select from Entities below)
              <EntityInput entities={entities} onChange={(entityId) => updateRule(index, { entityId })} placeholder="Select entity" value={rule.entityId} />
            </label>
            <SelectedEntityChip
              entity={entity}
              entityId={rule.entityId}
              onRemove={() => updateRule(index, { entityId: '', attribute: 'state', value: '' })}
            />
            <div className="condition-rule-grid">
              <label>
                Attribute
                <select value={rule.attribute ?? 'state'} onChange={(event) => updateRule(index, { attribute: event.target.value })}>
                  {attributes.map((attribute) => <option key={attribute} value={attribute}>{formatAttributeName(attribute)}</option>)}
                </select>
              </label>
              <label>
                Operator
                <select value={rule.operator ?? 'equals'} onChange={(event) => updateRule(index, { operator: event.target.value })}>
                  <option value="equals">equals</option>
                  <option value="not_equals">not equals</option>
                  <option value="contains">contains</option>
                </select>
              </label>
              <label>
                Value
                <ValueSelect entity={(rule.attribute ?? 'state') === 'state' ? entity : undefined} onChange={(value) => updateRule(index, { value })} options={valueOptions} placeholder="Select value" value={rule.value} />
              </label>
            </div>
          </div>
        )
      })}
      <button className="secondary-action condition-rule-add" onClick={addRule} type="button">Add Condition</button>
    </div>
  )
}

function SharedAttributes({ attributes, payload, updateNodeData }) {
  const [selectedKey, setSelectedKey] = useState(attributes[0]?.key ?? '')
  const payloadObject = parsePayloadObject(payload)
  const selectedAttribute = attributes.find((attribute) => attribute.key === selectedKey) ?? attributes[0]
  const valueOptions = getAttributeControlOptions(selectedAttribute)
  const updatePayload = (key, value) => {
    updateNodeData({ payload: JSON.stringify({ ...payloadObject, [key]: parseAttributeValue(value) }, null, 2) })
  }
  const updateParsedPayload = (key, value) => {
    updateNodeData({ payload: JSON.stringify({ ...payloadObject, [key]: value }, null, 2) })
  }

  useEffect(() => {
    if (attributes.length && !attributes.some((attribute) => attribute.key === selectedKey)) {
      setSelectedKey(attributes[0].key)
    }
  }, [attributes, selectedKey])

  if (!attributes.length) return null

  return (
    <div className="shared-attributes">
      <div className="mini-heading">Shared attribute</div>
      <label>
        Setting
        <select value={selectedAttribute?.key ?? ''} onChange={(event) => setSelectedKey(event.target.value)}>
          {attributes.map((attribute) => (
            <option key={attribute.key} value={attribute.key}>{formatAttributeName(attribute.key)}</option>
          ))}
        </select>
      </label>
      {selectedAttribute && (
        <label>
          Value
          {isColorAttribute(selectedAttribute.key) ? (
            <ColorValueInput
              attribute={selectedAttribute}
              onChange={(value) => updateParsedPayload(selectedAttribute.key, value)}
              value={payloadObject[selectedAttribute.key]}
            />
          ) : valueOptions.length ? (
            <select value={formatAttributeInput(payloadObject[selectedAttribute.key] ?? '')} onChange={(event) => updatePayload(selectedAttribute.key, event.target.value)}>
              <option value="">Choose value</option>
              {valueOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          ) : (
            <input
              value={formatAttributeInput(payloadObject[selectedAttribute.key] ?? '')}
              onChange={(event) => updatePayload(selectedAttribute.key, event.target.value)}
              placeholder={selectedAttribute.placeholder ?? formatAttributeInput(selectedAttribute.sample)}
            />
          )}
        </label>
      )}
    </div>
  )
}

function ColorValueInput({ attribute, value, onChange }) {
  const hexValue = colorAttributeToHex(attribute.key, value ?? attribute.sample)

  return (
    <div className="color-value-control">
      <input
        aria-label={formatAttributeName(attribute.key)}
        onChange={(event) => onChange(hexToColorAttribute(attribute.key, event.target.value))}
        type="color"
        value={hexValue}
      />
      <span>{hexValue.toUpperCase()}</span>
    </div>
  )
}

function getSharedAttributes(selectedEntities) {
  if (!selectedEntities.length) return []

  const ignored = new Set([
    'assumed_state',
    'color_mode',
    'device_class',
    'entity_id',
    'friendly_name',
    'last_triggered',
    'max_color_temp_kelvin',
    'max_mireds',
    'min_color_temp_kelvin',
    'min_mireds',
    'restored',
    'supported_color_modes',
    'supported_features',
  ])
  const commonKeys = selectedEntities
    .map((entity) => Object.keys(entity.attributes ?? {}).filter((key) => !ignored.has(key) && !key.endsWith('_list')))
    .reduce((shared, keys) => shared.filter((key) => keys.includes(key)))

  return commonKeys
    .sort()
    .map((key) => buildAttributeDescriptor(key, selectedEntities))
}

function getEntityAttributes(entity) {
  if (!entity) return []
  const ignored = new Set(['entity_id', 'friendly_name'])
  return Object.entries(entity.attributes ?? {})
    .filter(([key]) => !ignored.has(key))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key]) => buildAttributeDescriptor(key, [entity]))
}

function getAttributeValueOptions(attribute, stateOptions, entity, ...currentValues) {
  if (!attribute || attribute.key === 'state') {
    return Array.from(new Set([...stateOptions, ...currentValues].filter(Boolean))).map((value) => ({
      value,
      label: formatStateOption(value, entity),
    }))
  }

  const values = [
    ...(attribute.options ?? []).map((option) => option.value),
    attribute.sample,
    ...currentValues,
  ].filter((value) => value !== undefined && value !== null && value !== '')

  return Array.from(new Set(values.map((value) => formatAttributeInput(value)))).map((value) => ({
    value,
    label: formatStateOption(value),
  }))
}

function parsePayloadObject(payload) {
  try {
    const parsed = JSON.parse(payload || '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function parseAttributeValue(value) {
  const trimmed = String(value).trim()
  if (!trimmed) return ''
  try {
    return JSON.parse(trimmed)
  } catch {
    return value
  }
}

function getAttributeControlOptions(attribute) {
  if (!attribute) return []
  if (attribute.options?.length) return attribute.options
  const sample = attribute.sample
  if (Array.isArray(sample)) {
    if (!sample.every((value) => typeof value === 'string')) return []
    return sample
      .filter((value) => value === null || ['boolean', 'number', 'string'].includes(typeof value))
      .map((value) => {
        const formattedValue = formatAttributeInput(value)
        return { value: formattedValue, label: formatAttributeName(formattedValue) }
      })
  }
  if (typeof sample === 'boolean') {
    return [
      { value: 'true', label: 'True' },
      { value: 'false', label: 'False' },
    ]
  }
  return []
}

function buildAttributeDescriptor(key, entities) {
  const firstEntity = entities[0]
  const sample = firstEntity?.attributes?.[key]
  return {
    key,
    sample,
    options: getSharedAttributeOptions(key, entities),
    placeholder: getAttributePlaceholder(key, entities),
  }
}

function getSharedAttributeOptions(key, entities) {
  if (key === 'effect') return intersectArrayAttributeOptions(entities, 'effect_list')
  if (key === 'color_mode') return intersectArrayAttributeOptions(entities, 'supported_color_modes')

  const sampleValues = entities
    .map((entity) => entity.attributes?.[key])
    .filter((value) => value !== undefined && value !== null)
  if (sampleValues.every((value) => typeof value === 'boolean')) {
    return [
      { value: 'true', label: 'True' },
      { value: 'false', label: 'False' },
    ]
  }

  if (sampleValues.every((value) => Array.isArray(value))) {
    return intersectArrayValues(sampleValues)
  }

  return []
}

function intersectArrayAttributeOptions(entities, attributeKey) {
  return intersectArrayValues(entities.map((entity) => entity.attributes?.[attributeKey]).filter(Array.isArray))
}

function intersectArrayValues(arrays) {
  if (!arrays.length) return []
  const [first, ...rest] = arrays
  return first
    .filter((value) => rest.every((array) => array.includes(value)))
    .map((value) => {
      const formattedValue = formatAttributeInput(value)
      return { value: formattedValue, label: formatAttributeName(formattedValue) }
    })
}

function getAttributePlaceholder(key, entities) {
  if (key === 'brightness') return '0-255'
  if (key === 'brightness_pct') return '0-100'
  if (key === 'color_temp_kelvin') {
    const mins = entities.map((entity) => Number(entity.attributes?.min_color_temp_kelvin)).filter(Boolean)
    const maxes = entities.map((entity) => Number(entity.attributes?.max_color_temp_kelvin)).filter(Boolean)
    if (mins.length && maxes.length) return `${Math.max(...mins)}-${Math.min(...maxes)} K`
    return 'Kelvin'
  }
  return undefined
}

function isColorAttribute(key) {
  return ['hs_color', 'rgb_color', 'xy_color'].includes(key)
}

function colorAttributeToHex(key, value) {
  const parsed = Array.isArray(value) ? value : parseMaybeArray(value)
  if (key === 'rgb_color' && parsed.length >= 3) {
    return rgbToHex(Number(parsed[0]), Number(parsed[1]), Number(parsed[2]))
  }
  if (key === 'xy_color' && parsed.length >= 2) {
    const [r, g, b] = xyToRgb(Number(parsed[0]), Number(parsed[1]))
    return rgbToHex(r, g, b)
  }
  if (key === 'hs_color' && parsed.length >= 2) {
    const [r, g, b] = hsvToRgb(Number(parsed[0]), Number(parsed[1]), 100)
    return rgbToHex(r, g, b)
  }
  return '#ffffff'
}

function hexToColorAttribute(key, hex) {
  const [r, g, b] = hexToRgb(hex)
  if (key === 'rgb_color') return [r, g, b]
  if (key === 'xy_color') return rgbToXy(r, g, b)
  const [h, s] = rgbToHs(r, g, b)
  return [h, s]
}

function parseMaybeArray(value) {
  if (Array.isArray(value)) return value
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function hexToRgb(hex) {
  const normalized = String(hex).replace('#', '')
  const value = Number.parseInt(normalized.length === 3 ? normalized.split('').map((char) => char + char).join('') : normalized, 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b].map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0')).join('')}`
}

function rgbToHs(r, g, b) {
  const red = r / 255
  const green = g / 255
  const blue = b / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const delta = max - min
  let hue = 0

  if (delta) {
    if (max === red) hue = ((green - blue) / delta) % 6
    if (max === green) hue = (blue - red) / delta + 2
    if (max === blue) hue = (red - green) / delta + 4
    hue *= 60
    if (hue < 0) hue += 360
  }

  const saturation = max ? (delta / max) * 100 : 0
  return [Math.round(hue), Math.round(saturation)]
}

function hsvToRgb(hue, saturation, value) {
  const h = ((hue % 360) + 360) % 360
  const s = clamp(saturation, 0, 100) / 100
  const v = clamp(value, 0, 100) / 100
  const c = v * s
  const x = c * (1 - Math.abs((h / 60) % 2 - 1))
  const m = v - c
  const [r1, g1, b1] =
    h < 60 ? [c, x, 0] :
    h < 120 ? [x, c, 0] :
    h < 180 ? [0, c, x] :
    h < 240 ? [0, x, c] :
    h < 300 ? [x, 0, c] :
    [c, 0, x]

  return [(r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255].map(Math.round)
}

function rgbToXy(r, g, b) {
  const red = linearizeRgb(r)
  const green = linearizeRgb(g)
  const blue = linearizeRgb(b)
  const x = red * 0.4124 + green * 0.3576 + blue * 0.1805
  const y = red * 0.2126 + green * 0.7152 + blue * 0.0722
  const z = red * 0.0193 + green * 0.1192 + blue * 0.9505
  const total = x + y + z
  if (!total) return [0, 0]
  return [roundDecimal(x / total, 4), roundDecimal(y / total, 4)]
}

function xyToRgb(x, y) {
  if (!x || !y) return [255, 255, 255]
  const z = 1 - x - y
  const luminance = 1
  const bigX = (luminance / y) * x
  const bigZ = (luminance / y) * z
  const red = bigX * 3.2406 + luminance * -1.5372 + bigZ * -0.4986
  const green = bigX * -0.9689 + luminance * 1.8758 + bigZ * 0.0415
  const blue = bigX * 0.0557 + luminance * -0.204 + bigZ * 1.057
  const rgb = [red, green, blue].map(delinearizeRgb)
  const max = Math.max(...rgb, 1)
  return rgb.map((value) => clamp((value / max) * 255, 0, 255))
}

function linearizeRgb(value) {
  const channel = clamp(value, 0, 255) / 255
  return channel > 0.04045 ? ((channel + 0.055) / 1.055) ** 2.4 : channel / 12.92
}

function delinearizeRgb(value) {
  const channel = Math.max(0, value)
  return channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function roundDecimal(value, places) {
  const multiplier = 10 ** places
  return Math.round(value * multiplier) / multiplier
}

function formatAttributeInput(value) {
  if (Array.isArray(value) || (value && typeof value === 'object')) return JSON.stringify(value)
  return value ?? ''
}

function formatAttributeName(key) {
  const labels = {
    brightness_pct: 'Brightness Percent',
    color_temp_kelvin: 'Color Temperature',
    hs_color: 'Hue / Saturation',
    rgb_color: 'RGB Color',
    xy_color: 'XY Color',
  }
  return labels[key] || String(key).replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    console.error(error)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main className="app-error">
        <div>
          <h1>HAFlow</h1>
          <p>The flow editor hit an error while rendering this view.</p>
          <pre>{this.state.error.message}</pre>
          <button onClick={() => window.location.reload()} type="button">Reload</button>
        </div>
      </main>
    )
  }
}

export default function App() {
  return (
    <AppErrorBoundary>
      <ReactFlowProvider>
        <FlowWorkspace />
      </ReactFlowProvider>
    </AppErrorBoundary>
  )
}
