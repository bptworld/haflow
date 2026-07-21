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
  ArrowRightLeft,
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
  GitMerge,
  History,
  Home,
  ListTree,
  Mic,
  Moon,
  PanelRightClose,
  PanelRightOpen,
  Pause,
  Pencil,
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
const ON_OFF_SERVICES = new Set(['turn_on', 'turn_off'])
const NODE_KINDS_REQUIRING_OUTGOING = new Set(['state', 'event', 'time', 'condition', 'or', 'and', 'direction', 'delay', 'wait'])
const DIRECTION_ACTIVE_STATES = 'on, active, detected, open, occupied, home'
const PUSHOVER_PRIORITIES = [
  { value: '', label: 'Normal' },
  { value: '-2', label: 'Lowest' },
  { value: '-1', label: 'Low' },
  { value: '0', label: 'Normal' },
  { value: '1', label: 'High' },
  { value: '2', label: 'Emergency' },
]
const PUSHOVER_SOUNDS = [
  '',
  'pushover',
  'bike',
  'bugle',
  'cashregister',
  'classical',
  'cosmic',
  'falling',
  'gamelan',
  'incoming',
  'intermission',
  'magic',
  'mechanical',
  'pianobar',
  'siren',
  'spacealarm',
  'tugboat',
  'alien',
  'climb',
  'persistent',
  'echo',
  'updown',
  'vibrate',
  'none',
]
const WEEKDAY_OPTIONS = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
]
const SCHEDULE_TIME_TYPES = ['time', 'sunrise', 'sunset']
const RECIPE_WAIT_OPTIONS = [
  { value: '60', label: '1 minute' },
  { value: '120', label: '2 minutes' },
  { value: '300', label: '5 minutes' },
  { value: '600', label: '10 minutes' },
  { value: '900', label: '15 minutes' },
  { value: '1800', label: '30 minutes' },
]
const FLOW_RECIPES = [
  {
    id: 'motion-light-timeout',
    name: 'Motion Light With Timeout',
    description: 'Turn on a light or switch when motion is detected, wait, then turn it off only if motion is clear.',
    fields: [
      { id: 'motionSensor', label: 'Motion Sensor', type: 'entity', domains: ['binary_sensor'] },
      { id: 'targetEntity', label: 'Light, Switch, Fan, Or Helper', type: 'entity', domains: ['light', 'switch', 'fan', 'input_boolean'] },
      { id: 'waitSeconds', label: 'Wait Before Turning Off', type: 'choice', options: RECIPE_WAIT_OPTIONS, defaultValue: '120' },
    ],
  },
  {
    id: 'door-left-open',
    name: 'Door Left Open Notification',
    description: 'Wait after a door opens, check that it is still open, then send a notification.',
    fields: [
      { id: 'doorSensor', label: 'Door Sensor', type: 'entity', domains: ['binary_sensor'] },
      { id: 'waitSeconds', label: 'How Long The Door Can Stay Open', type: 'choice', options: RECIPE_WAIT_OPTIONS, defaultValue: '300' },
      { id: 'notifyService', label: 'Notification Service', type: 'notifyService' },
    ],
  },
  {
    id: 'schedule-scene',
    name: 'Scheduled Scene',
    description: 'Turn on a Home Assistant scene at a selected time every day.',
    fields: [
      { id: 'sceneEntity', label: 'Scene', type: 'entity', domains: ['scene'] },
      { id: 'timeOfDay', label: 'Time Of Day', type: 'choice', options: [
        { value: '06:00', label: '6:00 AM' },
        { value: '07:00', label: '7:00 AM' },
        { value: '18:00', label: '6:00 PM' },
        { value: '19:00', label: '7:00 PM' },
        { value: '22:00', label: '10:00 PM' },
      ], defaultValue: '19:00' },
    ],
  },
  {
    id: 'actionable-reminder',
    name: 'Actionable Yes/No Reminder',
    description: 'Ask any Yes/No question, end on Yes, or wait and send the question again after No. Includes a Timeout path.',
    fields: [
      { id: 'question', label: 'Question', type: 'text', defaultValue: 'Did you complete the task?' },
      { id: 'notifyService', label: 'Notification Service', type: 'notifyService' },
      { id: 'timeOfDay', label: 'First Reminder Time', type: 'choice', options: [
        { value: '08:00', label: '8:00 AM' },
        { value: '09:00', label: '9:00 AM' },
        { value: '12:00', label: '12:00 PM' },
        { value: '18:00', label: '6:00 PM' },
        { value: '20:00', label: '8:00 PM' },
      ], defaultValue: '09:00' },
      { id: 'reminderDelay', label: 'Wait After No', type: 'choice', options: RECIPE_WAIT_OPTIONS, defaultValue: '1800' },
      { id: 'responseTimeout', label: 'Response Timeout', type: 'choice', options: [
        { value: '60', label: '1 minute' },
        { value: '300', label: '5 minutes' },
        { value: '900', label: '15 minutes' },
        { value: '1800', label: '30 minutes' },
      ], defaultValue: '300' },
      { id: 'resendCount', label: 'Resend Attempts', type: 'choice', options: [
        { value: '0', label: 'None' },
        { value: '1', label: '1 resend' },
        { value: '2', label: '2 resends' },
        { value: '3', label: '3 resends' },
      ], defaultValue: '0' },
    ],
  },
]
const BINARY_SENSOR_STATE_LABELS = {
  battery: { on: 'Low', off: 'Normal' },
  battery_charging: { on: 'Charging', off: 'Not Charging' },
  carbon_monoxide: { on: 'Detected', off: 'Clear' },
  cold: { on: 'Cold', off: 'Normal' },
  connectivity: { on: 'Connected', off: 'Disconnected' },
  contact: { on: 'Open', off: 'Closed' },
  door: { on: 'Open', off: 'Closed' },
  garage_door: { on: 'Open', off: 'Closed' },
  gas: { on: 'Detected', off: 'Clear' },
  heat: { on: 'Hot', off: 'Normal' },
  light: { on: 'Light Detected', off: 'No Light' },
  lock: { on: 'Open', off: 'Closed' },
  moisture: { on: 'Wet', off: 'Dry' },
  motion: { on: 'Detected', off: 'Clear' },
  moving: { on: 'Moving', off: 'Stopped' },
  occupancy: { on: 'Occupied', off: 'Clear' },
  opening: { on: 'Open', off: 'Closed' },
  plug: { on: 'Plugged In', off: 'Unplugged' },
  power: { on: 'Power Detected', off: 'No Power' },
  presence: { on: 'Home', off: 'Away' },
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
    data: { scheduleMode: 'at', atType: 'time', at: '07:00', days: [], label: 'Schedule' },
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
    type: 'and',
    label: 'AND',
    description: 'Continues only when every incoming trigger or condition is currently active.',
    icon: GitMerge,
    color: '#0369a1',
    data: { activeStates: DIRECTION_ACTIVE_STATES, label: 'AND' },
  },
  {
    type: 'direction',
    label: 'Direction',
    description: 'Compares two active entities and writes whether movement went A to B or B to A.',
    icon: ArrowRightLeft,
    color: '#7c2d12',
    data: { entityA: '', entityB: '', activeStates: DIRECTION_ACTIVE_STATES, directionAB: 'in', directionBA: 'out', targetEntityId: '', label: 'Direction' },
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
    type: 'comment',
    label: 'Comment',
    description: 'Adds readable notes to the canvas without changing how the flow runs.',
    icon: Pencil,
    color: '#64748b',
    data: { label: 'Comment', text: 'Add a note about this flow.' },
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
    type: 'end',
    label: 'End',
    description: 'Ends a branch without running any action.',
    icon: Check,
    color: '#64748b',
    data: { label: 'End' },
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
    description: 'Sends a Home Assistant notification message. Use {direction} after a Direction node.',
    icon: Bell,
    color: '#be123c',
    data: { message: 'HAFlow ran', notifyService: '', target: '', title: '', dataJson: '{}', notifyActions: [], notifyTimeoutSeconds: 60, notifyResendCount: 0, pushoverPriority: '', pushoverSound: '', label: 'Notify' },
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

const AUTOMATED_RECIPE_NODE_KNOWLEDGE = [
  { kind: 'state', words: ['trigger', 'when', 'if', 'state changes'], description: 'starts a flow when an entity changes state' },
  { kind: 'event', words: ['event', 'home assistant event', 'state changed event'], description: 'starts a flow from a Home Assistant event' },
  { kind: 'time', words: ['schedule', 'time', 'sunrise', 'sunset', 'between'], description: 'starts or gates a flow by time' },
  { kind: 'condition', words: ['condition', 'only if', 'provided', 'while'], description: 'checks a value and branches true or false' },
  { kind: 'or', words: ['or', 'either', 'any'], description: 'continues when any incoming path reaches it' },
  { kind: 'and', words: ['and', 'all', 'both'], description: 'continues only when every incoming path is active' },
  { kind: 'direction', words: ['direction', 'movement', 'a to b', 'b to a', 'in out'], description: 'compares two active entities and stores direction' },
  { kind: 'group', words: ['group', 'subflow', 'frame'], description: 'frames nodes as a same-screen subflow' },
  { kind: 'comment', words: ['comment', 'note', 'annotation'], description: 'adds a readable canvas note' },
  { kind: 'delay', words: ['delay', 'wait for', 'pause for'], description: 'pauses for a fixed duration' },
  { kind: 'wait', words: ['wait until', 'wait for entity', 'until'], description: 'pauses until an entity reaches a state or timeout' },
  { kind: 'end', words: ['end', 'stop branch', 'stop here'], description: 'ends a branch' },
  { kind: 'service', words: ['action', 'service', 'turn on', 'turn off', 'call service'], description: 'runs a Home Assistant service' },
  { kind: 'notify', words: ['notify', 'notification', 'alert', 'message me'], description: 'sends a Home Assistant notification' },
  { kind: 'scene', words: ['scene', 'activate scene', 'turn on scene'], description: 'turns on a Home Assistant scene' },
  { kind: 'debug', words: ['debug', 'log', 'trace'], description: 'writes a message to the run log' },
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

function getDefaultVoiceSetupBaseUrl() {
  const { protocol, hostname } = window.location
  const host = hostname || 'homeassistant.local'
  return `${protocol === 'https:' ? 'https' : 'http'}://${host}:4177`
}

function buildVoiceSetupYaml(baseUrl) {
  const url = String(baseUrl || '').trim().replace(/\/+$/, '') || 'http://homeassistant.local:4177'
  return `rest_command:
  haflow_create_flow:
    url: "${url}/api/voice/flow"
    method: post
    content_type: "application/json"
    payload: >
      {"name":"{{ name }}"}

  haflow_create_recipe:
    url: "${url}/api/voice/recipe"
    method: post
    content_type: "application/json"
    payload: >
      {"recipe":"{{ recipe }}"}

conversation:
  intents:
    HAFlowCreateFlow:
      - "make a flow called {name}"
      - "create a flow called {name}"
      - "build a flow called {name}"

    HAFlowCreateRecipe:
      - "make a flow {recipe}"
      - "create a flow {recipe}"
      - "build a recipe {recipe}"
      - "make a recipe {recipe}"

intent_script:
  HAFlowCreateFlow:
    action:
      - action: rest_command.haflow_create_flow
        data:
          name: "{{ name }}"
    speech:
      text: "Created the HAFlow flow."

  HAFlowCreateRecipe:
    action:
      - action: rest_command.haflow_create_recipe
        data:
          recipe: "{{ recipe }}"
    speech:
      text: "Created the HAFlow recipe flow. Creating recipes is in beta, and your feedback is welcome."
`
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
  const validation = data.suppressValidation ? '' : validateNodeData(data)
  const runtimeStatus = data.runtimeStatus
  const disabled = data.disabled
  const summaryLines = summarizeNode(data)
  const showTargetHandle = !['state', 'event', 'comment'].includes(data.kind)

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

  if (data.kind === 'comment') {
    return (
      <div className={`flow-node comment-node ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''}`} style={{ '--node-color': catalogItem.color }} tabIndex={0}>
        <div className="node-header">
          <span className="node-icon"><Icon size={16} /></span>
          <span>{data.label || 'Comment'}</span>
        </div>
        <p>{data.text || 'Add a note about this flow.'}</p>
        {disabled && <div className="node-disabled"><Ban size={13} /> Disabled</div>}
      </div>
    )
  }

  return (
    <div className={`flow-node ${selected ? 'selected' : ''} ${validation ? 'invalid' : ''} ${runtimeStatus ? `runtime-${runtimeStatus}` : ''} ${disabled ? 'disabled' : ''}`} data-tooltip={catalogItem.description} style={{ '--node-color': catalogItem.color }} tabIndex={0}>
      {showTargetHandle && <Handle type="target" position={Position.Left} />}
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
      {data.kind === 'notify' && (data.notifyActions ?? []).some((action) => String(action?.title ?? '').trim() && String(action?.action ?? '').trim() !== 'URI') && (
        <div className="notify-node-branches">
          {(data.notifyActions ?? []).slice(0, 3).map((action, index) => (
            String(action?.title ?? '').trim() && String(action?.action ?? '').trim() !== 'URI' ? (
              <div className="notify-node-branch" key={`action-${index}`}>
                <span>{String(action.title)}</span>
                <Handle className="notify-branch-handle" id={`action-${index}`} title={String(action.title)} type="source" position={Position.Right} />
              </div>
            ) : null
          ))}
          <div className="notify-node-branch notify-node-timeout">
            <span>Timeout</span>
            <Handle className="notify-branch-handle notify-timeout-handle" id="timeout" title="Timeout" type="source" position={Position.Right} />
          </div>
        </div>
      )}
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
      ) : data.kind === 'notify' && (data.notifyActions ?? []).some((action) => String(action?.title ?? '').trim() && String(action?.action ?? '').trim() !== 'URI') ? null
        : data.kind === 'end' ? null : (
        <Handle type="source" position={Position.Right} />
      )}
    </div>
  )
}

const nodeTypes = { haflow: NodeBody }

function summarizeNode(data) {
  const selectedCount = data.entityIds?.length ?? 0
  const entityName = formatEntityRef(data)
  const entity = data.entityContext
  if (data.kind === 'state') {
    const rules = getStateTriggerRules(data)
    if (rules.length > 1) return `${rules.length} triggers`
    return data.entityId ? formatTriggerIntent(rules[0], entity) : 'Choose an entity'
  }
  if (data.kind === 'event') {
    if (data.eventType === 'state_changed' && data.entityId) return formatTriggerIntent(data, entity)
    return data.eventType || 'Any event'
  }
  if (data.kind === 'time') return formatScheduleSummary(data)
  if (data.kind === 'condition') {
    const rules = getConditionRules(data)
    if (rules.length > 1) return `${rules.length} ${data.conditionMode === 'all' ? 'AND' : 'OR'} conditions`
    return data.entityId ? formatConditionIntent(rules[0], entity) : 'Choose a condition'
  }
  if (data.kind === 'or') return 'Any incoming path continues'
  if (data.kind === 'and') return 'All incoming paths must be active'
  if (data.kind === 'direction') {
    if (!data.entityA || !data.entityB) return 'Choose two entities'
    const target = data.targetEntityId ? ` -> ${data.targetEntityId}` : ''
    return `${data.directionAB || 'in'} / ${data.directionBA || 'out'}${target}`
  }
  if (data.kind === 'delay') return `Wait ${data.seconds || 0}s`
  if (data.kind === 'wait') return data.entityId ? `Until ${formatAttributeName(data.attribute || 'state')} is ${formatStateOption(data.to || '', entity)}` : 'Choose an entity'
  if (data.kind === 'end') return 'Branch stops here'
  if (data.kind === 'service') {
    const serviceIntent = formatServiceIntent(data.domain, data.service, data.actionEntities)
    if (data.actionEntities?.length) return [serviceIntent, formatTargetSummary(data.actionEntities)]
    return selectedCount ? [serviceIntent, `${selectedCount} targets`] : 'Choose entities'
  }
  if (data.kind === 'notify') {
    const actionCount = (data.notifyActions ?? []).filter((action) => String(action?.title ?? '').trim()).length
    const target = data.notifyService ? `Notify notify.${data.notifyService}` : data.target ? `Notify ${data.target}` : data.message || 'Notification'
    return actionCount ? [target, `${actionCount} button${actionCount === 1 ? '' : 's'} · ${Number(data.notifyTimeoutSeconds ?? 60)}s timeout · ${Number(data.notifyResendCount ?? 0)} resend${Number(data.notifyResendCount ?? 0) === 1 ? '' : 's'}`] : target
  }
  if (data.kind === 'scene') return data.entityId ? `Turn on ${entityName}` : 'Choose a scene'
  if (data.kind === 'group') return 'Same-screen subflow'
  if (data.kind === 'comment') return data.text || 'Add a note about this flow.'
  return data.message || 'Debug output'
}

function formatEntityRef(data) {
  return data.entityDisplayName || data.entityId || 'Entity'
}

function formatTargetSummary(entities) {
  if (!entities.length) return 'No targets'
  if (entities.length === 1) return entities[0].name
  return `${entities.length} targets`
}

function formatServiceIntent(domain, service, actionEntities = []) {
  if (!domain || !service) return 'Choose service'
  const actionDomains = Array.from(new Set(actionEntities.map((entity) => String(entity.id || '').split('.')[0]).filter(Boolean)))
  if (ON_OFF_SERVICES.has(service) && actionDomains.length > 1) {
    return service === 'turn_on' ? 'Turn on selected entities' : 'Turn off selected entities'
  }
  const domainLabel = formatDomainName(domain)
  const serviceLabels = {
    turn_on: `Turn on ${domainLabel}`,
    turn_off: `Turn off ${domainLabel}`,
    toggle: `Toggle ${domainLabel}`,
    open_cover: `Open ${domainLabel}`,
    close_cover: `Close ${domainLabel}`,
    stop_cover: `Stop ${domainLabel}`,
    lock: `Lock ${domainLabel}`,
    unlock: `Unlock ${domainLabel}`,
    set_value: `Set ${domainLabel} value`,
    set_temperature: `Set ${domainLabel} temperature`,
    set_hvac_mode: `Set ${domainLabel} mode`,
    create: `Create ${domainLabel}`,
    dismiss: `Dismiss ${domainLabel}`,
  }
  return serviceLabels[service] || `${formatAttributeName(service)} ${domainLabel}`
}

function getScheduleTimeType(data, field) {
  const key = field === 'at' ? 'atType' : `${field}Type`
  return SCHEDULE_TIME_TYPES.includes(data[key]) ? data[key] : 'time'
}

function formatSchedulePoint(data, field) {
  const type = getScheduleTimeType(data, field)
  if (type === 'sunrise') return 'sunrise'
  if (type === 'sunset') return 'sunset'
  const key = field === 'at' ? 'at' : `${field}Time`
  return data[key] || '00:00'
}

function formatScheduleDays(days) {
  if (!Array.isArray(days) || !days.length || days.length === 7) return ''
  const selected = new Set(days.map(Number))
  return WEEKDAY_OPTIONS.filter((day) => selected.has(day.value)).map((day) => day.label).join(', ')
}

function formatScheduleSummary(data) {
  const days = formatScheduleDays(data.days)
  const suffix = days ? ` (${days})` : ''
  if (data.scheduleMode === 'between') return `Between ${formatSchedulePoint(data, 'start')} and ${formatSchedulePoint(data, 'end')}${suffix}`
  return `At ${formatSchedulePoint(data, 'at')}${suffix}`
}

function formatDomainName(domain) {
  const labels = {
    automation: 'automation',
    binary_sensor: 'binary sensor',
    climate: 'climate',
    cover: 'cover',
    fan: 'fan',
    humidifier: 'humidifier',
    input_boolean: 'helper',
    light: 'light',
    lock: 'lock',
    media_player: 'media player',
    notify: 'notification',
    persistent_notification: 'notification',
    scene: 'scene',
    script: 'script',
    switch: 'switch',
  }
  return labels[domain] || String(domain).replace(/_/g, ' ')
}

function formatTriggerIntent(rule, entity) {
  if (rule.operator && rule.value !== undefined && rule.value !== '') {
    const duration = isNumericValue(rule.duration) && Number(rule.duration) > 0 ? ` for ${rule.duration} ${rule.durationUnit || 'minutes'}` : ''
    return `${formatOperatorLabel(rule.operator)} ${rule.value}${duration}`
  }
  const from = rule.from && rule.from !== ANY_CHANGE ? formatStateOption(rule.from, entity) : ''
  const to = rule.to && rule.to !== ANY_CHANGE ? formatStateOption(rule.to, entity) : ''
  if (from && to) return `${from} -> ${to}`
  if (to) return `Becomes ${to}`
  if (from) return `Leaves ${from}`
  return 'Any state change'
}

function formatConditionIntent(rule, entity) {
  const attribute = formatAttributeName(rule.attribute || 'state')
  const value = formatStateOption(rule.value || '', rule.attribute === 'state' ? entity : undefined)
  return `${attribute} ${formatOperatorLabel(rule.operator)} ${value}`.trim()
}

function formatOperatorLabel(operator) {
  if (operator === 'not_equals') return 'not equals'
  if (operator === 'contains') return 'contains'
  if (operator === 'greater_than') return 'greater than'
  if (operator === 'greater_than_or_equal') return 'greater than or equal to'
  if (operator === 'less_than') return 'less than'
  if (operator === 'less_than_or_equal') return 'less than or equal to'
  return 'equals'
}

const COMPARISON_OPERATORS = ['equals', 'not_equals', 'greater_than', 'greater_than_or_equal', 'less_than', 'less_than_or_equal']

function isNumericValue(value) {
  return value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value))
}

function isNumericEntity(entity) {
  return Boolean(entity) && (
    ['number', 'input_number', 'counter'].includes(entity.domain) ||
    isNumericValue(entity.state) ||
    Boolean(entity.attributes?.unit_of_measurement) ||
    ['measurement', 'total', 'total_increasing'].includes(entity.attributes?.state_class)
  )
}

function isNumericConditionTarget(entity, attribute) {
  if (!attribute || attribute === 'state') return isNumericEntity(entity)
  return isNumericValue(entity?.attributes?.[attribute])
}

function getUniqueFlowName(name, flows, currentFlowId = '') {
  const baseName = String(name || 'New Flow').trim() || 'New Flow'
  const existing = new Set(flows
    .filter((flow) => flow.id !== currentFlowId)
    .map((flow) => String(flow.name || '').trim().toLowerCase()))
  if (!existing.has(baseName.toLowerCase())) return baseName
  let index = 2
  while (existing.has(`${baseName} ${index}`.toLowerCase())) index += 1
  return `${baseName} ${index}`
}

function formatEntityStatus(value, entity) {
  if (value === undefined || value === null || value === '') return 'Unknown'
  return formatStateOption(value, entity)
}

function getStateLabelMap(entity) {
  if (entity?.domain !== 'binary_sensor') return null
  const deviceClass = String(entity.attributes?.device_class || inferBinarySensorClass(entity)).toLowerCase()
  return BINARY_SENSOR_STATE_LABELS[deviceClass] || { on: 'On', off: 'Off' }
}

function inferBinarySensorClass(entity) {
  const haystack = [
    entity?.friendlyName,
    entity?.entity_id,
    entity?.deviceType,
  ].join(' ').toLowerCase()
  if (/\b(door|gate|garage door)\b/.test(haystack)) return 'door'
  if (/\b(window)\b/.test(haystack)) return 'window'
  if (/\b(contact|opening)\b/.test(haystack)) return 'opening'
  if (/\b(motion|movement)\b/.test(haystack)) return 'motion'
  if (/\b(occupancy|occupied)\b/.test(haystack)) return 'occupancy'
  if (/\b(presence|present)\b/.test(haystack)) return 'presence'
  if (/\b(moisture|water|leak|wet)\b/.test(haystack)) return 'moisture'
  if (/\b(smoke)\b/.test(haystack)) return 'smoke'
  if (/\b(carbon monoxide|co)\b/.test(haystack)) return 'carbon_monoxide'
  if (/\b(gas)\b/.test(haystack)) return 'gas'
  if (/\b(tamper)\b/.test(haystack)) return 'tamper'
  if (/\b(vibration)\b/.test(haystack)) return 'vibration'
  return ''
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
      operator: [...COMPARISON_OPERATORS, 'contains'].includes(rule.operator) ? rule.operator : 'equals',
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
        operator: data.operator ?? '',
        value: data.value ?? '',
        duration: data.duration ?? '',
        durationUnit: data.durationUnit ?? 'minutes',
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
      operator: COMPARISON_OPERATORS.includes(rule.operator) ? rule.operator : '',
      value: rule.value ?? '',
      duration: rule.duration ?? '',
      durationUnit: ['seconds', 'minutes', 'hours'].includes(rule.durationUnit) ? rule.durationUnit : 'minutes',
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
  if (data.suppressValidation) return ''
  if (data.disabled) return ''
  const hasEntityCatalog = entityById.size > 0
  const entityExists = (entityId) => !entityId || !hasEntityCatalog || entityById.has(entityId)
  if (data.kind === 'state') {
    const rules = getStateTriggerRules(data)
    if (!rules.length || rules.some((rule) => !rule.entityId && !rule.deviceId)) return 'Missing entity'
    if (rules.some((rule) => rule.entityId && !entityExists(rule.entityId))) return 'Entity not found'
    if (rules.some((rule) => rule.operator && !isNumericValue(rule.value))) return 'Numeric triggers need a comparison value'
    if (rules.some((rule) => rule.duration !== '' && (!Number.isFinite(Number(rule.duration)) || Number(rule.duration) < 0))) return 'Trigger duration must be a non-negative number'
  }
  if (data.kind === 'event' && data.entityId && !entityExists(data.entityId)) return 'Entity not found'
  if (data.kind === 'time') {
    const mode = data.scheduleMode === 'between' ? 'between' : 'at'
    if (mode === 'at' && getScheduleTimeType(data, 'at') === 'time' && !data.at) return 'Missing time'
    if (mode === 'between') {
      if (getScheduleTimeType(data, 'start') === 'time' && !data.startTime) return 'Missing start'
      if (getScheduleTimeType(data, 'end') === 'time' && !data.endTime) return 'Missing end'
    }
  }
  if (data.kind === 'condition') {
    const rules = getConditionRules(data)
    if (!rules.length || rules.some((rule) => !rule.entityId)) return 'Missing entity'
    if (rules.some((rule) => rule.entityId && !entityExists(rule.entityId))) return 'Entity not found'
    if (rules.some((rule) => !rule.value && rule.operator !== 'exists')) return 'Missing value'
  }
  if (data.kind === 'direction') {
    if (!data.entityA || !data.entityB) return 'Missing entities'
    if (data.entityA && !entityExists(data.entityA)) return 'Entity A not found'
    if (data.entityB && !entityExists(data.entityB)) return 'Entity B not found'
    if (!data.directionAB || !data.directionBA) return 'Missing direction labels'
    if (!data.targetEntityId) return 'Missing target helper'
    if (data.targetEntityId && !entityExists(data.targetEntityId)) return 'Target not found'
    if (data.targetEntityId && !['input_text', 'input_select'].includes(String(data.targetEntityId).split('.')[0])) return 'Use input_text or input_select'
  }
  if (data.kind === 'wait' && !data.entityId) return 'Missing entity'
  if (data.kind === 'wait' && data.entityId && !entityExists(data.entityId)) return 'Entity not found'
  if (data.kind === 'service') {
    if (!data.domain || !data.service) return 'Missing service'
    const entityIds = data.entityIds?.length ? data.entityIds : (data.entityId ? [data.entityId] : [])
    const serviceIssue = getServiceValidationIssue(data, entityIds, services)
    if (serviceIssue) return serviceIssue
    if (entityIds.some((entityId) => !entityExists(entityId))) return 'Entity not found'
    if (data.payload && String(data.payload).trim()) {
      try {
        JSON.parse(data.payload)
      } catch {
        return 'Bad JSON'
      }
    }
  }
  if (data.kind === 'notify' && data.dataJson && String(data.dataJson).trim()) {
    try {
      JSON.parse(data.dataJson)
    } catch {
      return 'Bad data JSON'
    }
  }
  if (data.kind === 'notify') {
    const incompleteAction = (data.notifyActions ?? []).find((action) => {
      const hasAnyValue = action?.title || action?.action || action?.uri
      return hasAnyValue && !String(action.title ?? '').trim()
    })
    if (incompleteAction) return 'Notification buttons need a label'
    const timeoutSeconds = Number(data.notifyTimeoutSeconds ?? 60)
    const resendCount = Number(data.notifyResendCount ?? 0)
    if (!Number.isFinite(timeoutSeconds) || timeoutSeconds < 1) return 'Notification timeout must be at least 1 second'
    if (!Number.isInteger(resendCount) || resendCount < 0) return 'Notification resends must be a non-negative whole number'
  }
  if (data.kind === 'scene' && !data.entityId) return 'Missing scene'
  if (data.kind === 'scene' && data.entityId && !entityExists(data.entityId)) return 'Scene not found'
  return ''
}

function getServiceValidationIssue(data, entityIds, services = {}) {
  if (!ON_OFF_SERVICES.has(data.service) || !entityIds.length) {
    if (services[data.domain] && !services[data.domain][data.service]) return 'Service not found'
    return ''
  }

  const domains = Array.from(new Set(entityIds.map((entityId) => String(entityId).split('.')[0]).filter(Boolean)))
  const missingDomain = domains.find((domain) => services[domain] && !services[domain][data.service])
  return missingDomain ? `${formatDomainName(missingDomain)} does not support ${formatAttributeName(data.service)}` : ''
}

function validateFlow(nodes, edges, entityById = new Map(), services = {}, isPaused = false) {
  const issues = []
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
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
    const suppressValidation = shouldSuppressNodeValidation(node, nodesById)
    const nodeIssue = validateNodeData(node.data ?? {}, entityById, services)
    if (nodeIssue && !suppressValidation) issues.push(`${node.data?.label || node.id}: ${nodeIssue}`)
    if (node.data?.kind === 'service' && !suppressValidation) {
      const entityIds = node.data.entityIds?.length ? node.data.entityIds : (node.data.entityId ? [node.data.entityId] : [])
      if (!entityIds.length && !TARGETLESS_SERVICE_DOMAINS.has(node.data.domain) && !String(node.data.payload || '').includes('entity_id')) issues.push(`${node.data?.label || node.id}: No target entity`)
    }
    if (['condition', 'and'].includes(node.data?.kind) && !incoming.get(node.id)) {
      issues.push(`${node.data?.label || node.id}: No incoming link`)
    }
    if (NODE_KINDS_REQUIRING_OUTGOING.has(node.data?.kind) && !outgoing.get(node.id)) {
      issues.push(`${node.data?.label || node.id}: No outgoing link`)
    }
  }

  return issues
}

function shouldSuppressNodeValidation(node, nodesById) {
  if (node.data?.kind !== 'service') return false
  const parent = node.parentId ? nodesById.get(node.parentId) : null
  if (!parent || parent.data?.kind !== 'group') return false
  const label = `${parent.data?.label || ''} ${parent.data?.groupDeviceName || ''}`.toLowerCase()
  return label.includes('button') || label.includes('pico') || label.includes('controller')
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
  if (node.data?.kind === 'direction') return [node.data.entityA, node.data.entityB, node.data.targetEntityId].includes(entityId)
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
    entityContext: entity,
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

function recipeEntityMatchesField(entity, field) {
  if (!isSelectableEntity(entity)) return false
  if (!field.domains?.length) return true
  return field.domains.includes(entity.domain || String(entity.entity_id).split('.')[0])
}

function getRecipeEntityOptions(entities, field) {
  return entities
    .filter((entity) => recipeEntityMatchesField(entity, field))
    .sort((first, second) => (
      (first.areaName || 'Unassigned').localeCompare(second.areaName || 'Unassigned') ||
      (first.friendlyName || first.entity_id).localeCompare(second.friendlyName || second.entity_id)
    ))
}

function getRecipeEntityLabel(entities, entityId) {
  const entity = entities.find((item) => item.entity_id === entityId)
  return entity?.friendlyName || entityId
}

function buildRecipeEntityHints(entities = []) {
  return entities
    .filter((entity) => entity?.entity_id && entity.catalogType !== 'device')
    .flatMap((entity) => {
      const entityId = String(entity.entity_id)
      const domain = entity.domain || entityId.split('.')[0]
      const areaName = entity.areaName || ''
      const friendlyName = entity.friendlyName || entity.attributes?.friendly_name || entity.name || ''
      const areaFriendlyName = areaName && friendlyName && !normalizeRecipeText(friendlyName).startsWith(normalizeRecipeText(areaName))
        ? `${areaName} ${friendlyName}`
        : ''
      const names = new Set([
        friendlyName,
        entity.friendly_name,
        entity.attributes?.friendly_name,
        entity.name,
        areaFriendlyName,
        areaName && entity.deviceType ? `${areaName} ${entity.deviceType}` : '',
        entityId.split('.').slice(1).join('.').replace(/_/g, ' '),
      ].filter(Boolean).map(String))
      for (const name of Array.from(names)) {
        const stripped = stripRecipeEntitySuffixes(name)
        if (stripped && stripped !== normalizeRecipeText(name)) names.add(stripped)
      }
      return Array.from(names).map((name) => ({
        name,
        entityId,
        domain,
        deviceClass: entity.attributes?.device_class || '',
        deviceType: entity.deviceType || '',
        state: entity.state || '',
        valueOptions: entity.valueOptions || [],
      }))
    })
}

function withResolvedRecipeEntity(item, entityHints, preferredDomains = []) {
  const match = resolveRecipeEntityHint(item.label, entityHints, preferredDomains)
  if (!match) return item
  const resolvedState = item.requestedState ? recipeStateForResolvedEntity(item.requestedState, match) : item.state
  return {
    ...item,
    ...(resolvedState ? { state: resolvedState } : {}),
    ...(match.confident ? { entityId: match.entityId, domain: match.domain || item.domain } : {}),
    ...(match.suggestions.length ? { entitySuggestions: match.suggestions } : {}),
  }
}

function resolveRecipeEntityHint(label, entityHints = [], preferredDomains = []) {
  const normalizedLabel = normalizeRecipeText(label)
  if (!normalizedLabel) return null
  const allowedDomains = new Set(preferredDomains.filter(Boolean))
  const matches = entityHints
    .map((hint) => {
      const entityId = String(hint.entityId || hint.entity_id || '')
      const name = String(hint.name || hint.friendlyName || hint.friendly_name || '')
      const domain = String(hint.domain || entityId.split('.')[0] || '')
      const hintDeviceText = normalizeRecipeText([hint.deviceClass, hint.deviceType].filter(Boolean).join(' '))
      const normalizedName = normalizeRecipeText(name)
      const normalizedEntity = normalizeRecipeText(entityId.split('.').slice(1).join(' ').replace(/_/g, ' '))
      const normalizedSearchName = normalizeRecipeText([normalizedName, normalizedEntity, hintDeviceText].filter(Boolean).join(' '))
      const exact = normalizedName === normalizedLabel || normalizedEntity === normalizedLabel
      const contains = normalizedName.includes(normalizedLabel) || normalizedLabel.includes(normalizedName) || normalizedEntity.includes(normalizedLabel)
      const nameCoverage = recipeTextSimilarity(normalizedLabel, normalizedName)
      const entityCoverage = recipeTextSimilarity(normalizedLabel, normalizedEntity)
      const searchCoverage = recipeTextSimilarity(normalizedLabel, normalizedSearchName)
      const matchCoverage = Math.max(nameCoverage, entityCoverage, searchCoverage)
      const close = nameCoverage >= 0.45 || entityCoverage >= 0.45 || searchCoverage >= 0.72
      if (!entityId || (!exact && !contains && !close)) return null
      const specificContains = contains && recipeHasSpecificEntityName(normalizedName) && Math.max(nameCoverage, entityCoverage) >= 0.5
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

function getRecipeConditionDomains(state) {
  if (['locked', 'unlocked'].includes(state)) return ['lock']
  return ['binary_sensor', 'input_boolean', 'switch', 'sensor', 'cover', 'lock', 'person', 'device_tracker']
}

function recipeTextSimilarity(firstValue, secondValue) {
  const firstTokens = normalizeRecipeMatchTokens(firstValue)
  const secondTokens = normalizeRecipeMatchTokens(secondValue)
  if (!firstTokens.length || !secondTokens.length) return 0
  const matchedSecondIndexes = new Set()
  let score = 0
  for (const firstToken of firstTokens) {
    const matchIndex = secondTokens.findIndex((secondToken, index) => !matchedSecondIndexes.has(index) && recipeTokensMatch(firstToken, secondToken))
    if (matchIndex >= 0) {
      matchedSecondIndexes.add(matchIndex)
      score += firstToken === secondTokens[matchIndex] ? 1 : 0.72
    }
  }
  return score / Math.max(firstTokens.length, secondTokens.length)
}

function recipeStateForResolvedEntity(requestedState, match) {
  const requested = normalizeRecipeText(requestedState)
  const options = new Set([match.state, ...(match.valueOptions || [])].filter(Boolean).map((value) => normalizeRecipeText(value)))
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
  return recipeStateToHomeAssistantState(requested)
}

function normalizeRecipeMatchTokens(value) {
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
  return normalizeRecipeText(value)
    .split(' ')
    .flatMap((token) => (aliases[token] || token).split(' '))
    .filter((token) => token.length > 1)
}

function recipeTokensMatch(firstToken, secondToken) {
  if (firstToken === secondToken) return true
  if (firstToken.length >= 3 && secondToken.startsWith(firstToken)) return true
  if (secondToken.length >= 3 && firstToken.startsWith(secondToken)) return true
  return false
}

function stripRecipeEntitySuffixes(value) {
  return normalizeRecipeText(value)
    .replace(/\b(?:binary sensor|contact sensor|contact|sensor|opening sensor|door sensor|window sensor|motion sensor|light entity|switch entity)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function recipeHasSpecificEntityName(value) {
  const generic = new Set(['lamp', 'light', 'switch', 'sensor', 'door', 'fan', 'helper'])
  const tokens = normalizeRecipeMatchTokens(value).filter((token) => !generic.has(token))
  return tokens.length > 0 || normalizeRecipeMatchTokens(value).length >= 2
}

function buildRecipeFlow(recipe, values, entities) {
  const label = (entityId) => getRecipeEntityLabel(entities, entityId)
  const id = (name) => `${recipe.id}-${name}-${createId().slice(0, 8)}`

  if (recipe.id === 'motion-light-timeout') {
    const motionSensor = values.motionSensor
    const targetEntity = values.targetEntity
    const waitSeconds = Number(values.waitSeconds || 120)
    const targetDomain = String(targetEntity).split('.')[0] || 'homeassistant'
    const triggerId = id('motion-detected')
    const onId = id('turn-on')
    const delayId = id('wait')
    const clearId = id('motion-clear')
    const offId = id('turn-off')
    return {
      nodes: [
        { id: triggerId, type: 'haflow', position: { x: 80, y: 120 }, data: { kind: 'state', label: `${label(motionSensor)} Detected`, entityId: motionSensor, from: 'off', to: 'on', triggers: [{ id: `${triggerId}-rule`, entityId: motionSensor, from: 'off', to: 'on' }] } },
        { id: onId, type: 'haflow', position: { x: 380, y: 120 }, data: { kind: 'service', label: `Turn On ${label(targetEntity)}`, domain: targetDomain, service: 'turn_on', entityId: targetEntity, entityIds: [targetEntity], payload: '{}' } },
        { id: delayId, type: 'haflow', position: { x: 680, y: 120 }, data: { kind: 'delay', label: `Wait ${formatDuration(waitSeconds * 1000)}`, seconds: waitSeconds } },
        { id: clearId, type: 'haflow', position: { x: 980, y: 120 }, data: { kind: 'condition', label: `${label(motionSensor)} Clear`, conditionMode: 'all', entityId: motionSensor, attribute: 'state', operator: 'equals', value: 'off', conditions: [{ id: `${clearId}-condition`, entityId: motionSensor, attribute: 'state', operator: 'equals', value: 'off' }] } },
        { id: offId, type: 'haflow', position: { x: 1280, y: 120 }, data: { kind: 'service', label: `Turn Off ${label(targetEntity)}`, domain: targetDomain, service: 'turn_off', entityId: targetEntity, entityIds: [targetEntity], payload: '{}' } },
      ],
      edges: [
        { id: `${triggerId}-${onId}`, source: triggerId, target: onId, animated: true },
        { id: `${onId}-${delayId}`, source: onId, target: delayId, animated: true },
        { id: `${delayId}-${clearId}`, source: delayId, target: clearId, animated: true },
        { id: `${clearId}-${offId}`, source: clearId, sourceHandle: 'true', target: offId, animated: true },
      ],
    }
  }

  if (recipe.id === 'door-left-open') {
    const doorSensor = values.doorSensor
    const waitSeconds = Number(values.waitSeconds || 300)
    const notifyService = values.notifyService || ''
    const triggerId = id('door-opened')
    const delayId = id('wait')
    const openId = id('door-still-open')
    const notifyId = id('notify')
    return {
      nodes: [
        { id: triggerId, type: 'haflow', position: { x: 80, y: 120 }, data: { kind: 'state', label: `${label(doorSensor)} Opened`, entityId: doorSensor, from: 'off', to: 'on', triggers: [{ id: `${triggerId}-rule`, entityId: doorSensor, from: 'off', to: 'on' }] } },
        { id: delayId, type: 'haflow', position: { x: 380, y: 120 }, data: { kind: 'delay', label: `Wait ${formatDuration(waitSeconds * 1000)}`, seconds: waitSeconds } },
        { id: openId, type: 'haflow', position: { x: 680, y: 120 }, data: { kind: 'condition', label: `${label(doorSensor)} Still Open`, conditionMode: 'all', entityId: doorSensor, attribute: 'state', operator: 'equals', value: 'on', conditions: [{ id: `${openId}-condition`, entityId: doorSensor, attribute: 'state', operator: 'equals', value: 'on' }] } },
        { id: notifyId, type: 'haflow', position: { x: 980, y: 120 }, data: { kind: 'notify', label: 'Send Door Notification', notifyService, target: notifyService, title: 'Door left open', message: `${label(doorSensor)} has been open for ${formatDuration(waitSeconds * 1000)}.`, dataJson: '{}', pushoverPriority: '', pushoverSound: '' } },
      ],
      edges: [
        { id: `${triggerId}-${delayId}`, source: triggerId, target: delayId, animated: true },
        { id: `${delayId}-${openId}`, source: delayId, target: openId, animated: true },
        { id: `${openId}-${notifyId}`, source: openId, sourceHandle: 'true', target: notifyId, animated: true },
      ],
    }
  }

  if (recipe.id === 'schedule-scene') {
    const sceneEntity = values.sceneEntity
    const timeOfDay = values.timeOfDay || '19:00'
    const scheduleId = id('schedule')
    const sceneId = id('scene')
    return {
      nodes: [
        { id: scheduleId, type: 'haflow', position: { x: 80, y: 120 }, data: { kind: 'time', label: `Every Day At ${timeOfDay}`, scheduleMode: 'at', atType: 'time', at: timeOfDay, days: [] } },
        { id: sceneId, type: 'haflow', position: { x: 380, y: 120 }, data: { kind: 'scene', label: `Turn On ${label(sceneEntity)}`, entityId: sceneEntity } },
      ],
      edges: [{ id: `${scheduleId}-${sceneId}`, source: scheduleId, target: sceneId, animated: true }],
    }
  }

  if (recipe.id === 'actionable-reminder') {
    const question = String(values.question || 'Did you complete the task?').trim()
    const notifyService = values.notifyService || ''
    const timeOfDay = values.timeOfDay || '09:00'
    const reminderDelay = Number(values.reminderDelay || 1800)
    const responseTimeout = Number(values.responseTimeout || 300)
    const resendCount = Number(values.resendCount || 0)
    const scheduleId = id('schedule')
    const questionId = id('question')
    const yesEndId = id('yes-end')
    const noDelayId = id('no-delay')
    const timeoutEndId = id('timeout-end')
    const repeatId = id('repeat-question')
    const repeatEndId = id('repeat-end')
    const notifyData = (message, labelText) => ({
      kind: 'notify',
      label: labelText,
      notifyService,
      target: notifyService,
      title: 'Reminder',
      message,
      dataJson: '{}',
      notifyActions: [{ title: 'Yes', action: '' }, { title: 'No', action: '' }],
      notifyTimeoutSeconds: responseTimeout,
      notifyResendCount: resendCount,
      pushoverPriority: '',
      pushoverSound: '',
    })
    return {
      nodes: [
        { id: scheduleId, type: 'haflow', position: { x: 80, y: 240 }, data: { kind: 'time', label: `Every Day At ${timeOfDay}`, scheduleMode: 'at', atType: 'time', at: timeOfDay, days: [] } },
        { id: questionId, type: 'haflow', position: { x: 380, y: 240 }, data: notifyData(question, 'Ask Yes Or No') },
        { id: yesEndId, type: 'haflow', position: { x: 720, y: 60 }, data: { kind: 'end', label: 'Yes — Complete' } },
        { id: noDelayId, type: 'haflow', position: { x: 720, y: 260 }, data: { kind: 'delay', label: `Wait ${formatDuration(reminderDelay * 1000)}`, seconds: reminderDelay } },
        { id: timeoutEndId, type: 'haflow', position: { x: 720, y: 480 }, data: { kind: 'end', label: 'No Response — End' } },
        { id: repeatId, type: 'haflow', position: { x: 1040, y: 260 }, data: notifyData(`Reminder: ${question}`, 'Ask Again') },
        { id: repeatEndId, type: 'haflow', position: { x: 1380, y: 260 }, data: { kind: 'end', label: 'Second Response — End' } },
      ],
      edges: [
        { id: `${scheduleId}-${questionId}`, source: scheduleId, target: questionId, animated: true },
        { id: `${questionId}-${yesEndId}`, source: questionId, sourceHandle: 'action-0', target: yesEndId, animated: true },
        { id: `${questionId}-${noDelayId}`, source: questionId, sourceHandle: 'action-1', target: noDelayId, animated: true },
        { id: `${questionId}-${timeoutEndId}`, source: questionId, sourceHandle: 'timeout', target: timeoutEndId, animated: true },
        { id: `${noDelayId}-${repeatId}`, source: noDelayId, target: repeatId, animated: true },
        { id: `${repeatId}-yes-${repeatEndId}`, source: repeatId, sourceHandle: 'action-0', target: repeatEndId, animated: true },
        { id: `${repeatId}-no-${repeatEndId}`, source: repeatId, sourceHandle: 'action-1', target: repeatEndId, animated: true },
        { id: `${repeatId}-timeout-${repeatEndId}`, source: repeatId, sourceHandle: 'timeout', target: repeatEndId, animated: true },
      ],
    }
  }

  return { nodes: [], edges: [] }
}

function buildAutomatedRecipeFlow(description, { allowPartial = false, entityHints = [] } = {}) {
  const text = String(description || '').trim()
  if (!text) throw new Error('Describe the flow you want to create.')

  const recipeSections = splitRecipeElseSections(text)
  const conditions = parseRecipeConditions(recipeSections.primary).map((condition) => withResolvedRecipeEntity(condition, entityHints, getRecipeConditionDomains(condition.state)))
  const actions = parseRecipeActions(recipeSections.primary).map((action) => withResolvedRecipeEntity(action, entityHints, [action.domain]))
  const elseActions = recipeSections.otherwise ? parseRecipeActions(recipeSections.otherwise).map((action) => withResolvedRecipeEntity(action, entityHints, [action.domain])) : []
  const schedule = parseRecipeSchedule(text)
  const waitSeconds = parseRecipeWait(recipeSections.primary)
  const waitUntil = parseRecipeWaitUntil(recipeSections.primary)
  const requestedNodes = parseRecipeNodeRequests(recipeSections.primary)

  const runnableNodeRequests = requestedNodes.filter((node) => !['group', 'comment'].includes(node.kind))
  if (!allowPartial && !actions.length && !elseActions.length && !runnableNodeRequests.length && !waitUntil) throw new Error('I could not find an action. Try wording like "turn on hallway light", "send a notification", or "activate a scene".')
  if (!allowPartial && !conditions.length && !schedule) throw new Error('I could not find a trigger or time window. Try wording like "if front door is open" or "at sunset".')
  if (allowPartial && !actions.length && !elseActions.length && !conditions.length && !schedule && !waitSeconds && !waitUntil && !requestedNodes.length) throw new Error('I could not find anything to add or change.')

  const nodes = []
  const edges = []
  const prefix = `auto-recipe-${createId().slice(0, 8)}`
  const nextId = (name) => `${prefix}-${name}-${nodes.length + 1}`
  const addNode = (kind, label, x, data) => {
    const id = nextId(kind)
    nodes.push({ id, type: 'haflow', position: { x, y: 120 }, data: { kind, label, ...data } })
    return id
  }
  const connect = (source, target, sourceHandle) => {
    edges.push({ id: `${source}-${target}`, source, sourceHandle, target, animated: true })
  }

  let previousId = ''
  let lastConditionId = ''
  let x = 80
  const [triggerCondition, ...extraConditions] = conditions

  if (triggerCondition) {
    const triggerId = addNode('state', `${triggerCondition.label} ${triggerCondition.stateLabel || formatStateOption(triggerCondition.state)}`, x, {
      entityId: '',
      from: oppositeState(triggerCondition.state),
      to: triggerCondition.state,
      ...(triggerCondition.entityId ? { entityId: triggerCondition.entityId } : {}),
      ...(triggerCondition.entitySuggestions ? { entitySuggestions: triggerCondition.entitySuggestions } : {}),
      triggers: [{ id: `${prefix}-trigger-rule`, entityId: triggerCondition.entityId || '', from: oppositeState(triggerCondition.state), to: triggerCondition.state }],
    })
    previousId = triggerId
    x += 300
  }

  if (schedule) {
    const scheduleId = addNode('time', schedule.label, x, schedule.data)
    if (previousId) connect(previousId, scheduleId)
    previousId = scheduleId
    x += 300
  }

  for (const condition of extraConditions) {
    const conditionId = addNode('condition', `${condition.label} Is ${condition.stateLabel || formatStateOption(condition.state)}`, x, {
      conditionMode: 'all',
      entityId: '',
      attribute: 'state',
      operator: 'equals',
      value: condition.state,
      ...(condition.entitySuggestions ? { entitySuggestions: condition.entitySuggestions } : {}),
      conditions: [{ id: `${prefix}-condition-${createId().slice(0, 6)}`, entityId: '', attribute: 'state', operator: 'equals', value: condition.state }],
      ...(condition.entityId ? {
        entityId: condition.entityId,
        conditions: [{ id: `${prefix}-condition-${createId().slice(0, 6)}`, entityId: condition.entityId, attribute: 'state', operator: 'equals', value: condition.state }],
      } : {}),
    })
    if (previousId) connect(previousId, conditionId)
    previousId = conditionId
    lastConditionId = conditionId
    x += 300
  }

  if (waitSeconds && actions.length <= 1) {
    const delayId = addNode('delay', `Wait ${formatDuration(waitSeconds * 1000)}`, x, { seconds: waitSeconds })
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
    const actionX = x + (index * 300) + (waitSeconds && actions.length > 1 && index > 0 ? 300 : 0)
    const actionId = addNode('service', `${formatAttributeName(action.service)} ${action.label}`, actionX, {
      domain: action.domain,
      service: action.service,
      entityId: action.entityId || '',
      entityIds: action.entityId ? [action.entityId] : [],
      ...(action.entitySuggestions ? { entitySuggestions: action.entitySuggestions } : {}),
      payload: action.payload,
    })
    if (previousId) connect(previousId, actionId, previousId.includes('condition') ? 'true' : undefined)
    previousId = actionId
    if (waitSeconds && actions.length > 1 && index === 0) {
      const delayId = addNode('delay', `Wait ${formatDuration(waitSeconds * 1000)}`, actionX + 300, { seconds: waitSeconds })
      connect(previousId, delayId)
      previousId = delayId
    }
  })
  if (actions.length) x += (actions.length + (waitSeconds && actions.length > 1 ? 1 : 0)) * 300

  elseActions.forEach((action, index) => {
    const actionId = addNode('service', `Otherwise ${formatAttributeName(action.service)} ${action.label}`, x + (index * 300), {
      domain: action.domain,
      service: action.service,
      entityId: action.entityId || '',
      entityIds: action.entityId ? [action.entityId] : [],
      ...(action.entitySuggestions ? { entitySuggestions: action.entitySuggestions } : {}),
      payload: action.payload,
    })
    if (lastConditionId) connect(lastConditionId, actionId, 'false')
  })
  if (elseActions.length) x += elseActions.length * 300

  requestedNodes.forEach((nodeRequest, index) => {
    const nodeId = addNode(nodeRequest.kind, nodeRequest.label, x + (index * 300), nodeRequest.data)
    if (previousId && !['group', 'comment'].includes(nodeRequest.kind)) connect(previousId, nodeId, previousId.includes('condition') ? 'true' : undefined)
    if (!['group', 'comment'].includes(nodeRequest.kind)) previousId = nodeId
  })

  return {
    flowName: titleFromRecipeText(text),
    nodes,
    edges,
    summary: [
      triggerCondition ? `Trigger: ${triggerCondition.label} is ${triggerCondition.stateLabel || formatStateOption(triggerCondition.state)}.` : '',
      schedule ? `Time window: ${schedule.label}.` : '',
      ...extraConditions.map((condition) => `Condition: ${condition.label} is ${condition.stateLabel || formatStateOption(condition.state)}.`),
      waitSeconds ? `Wait: ${formatDuration(waitSeconds * 1000)}.` : '',
      waitUntil ? `Wait until: ${waitUntil.summary}.` : '',
      ...actions.map((action) => `Action: ${formatAttributeName(action.service)} ${action.label}.`),
      ...elseActions.map((action) => `Otherwise: ${formatAttributeName(action.service)} ${action.label}.`),
      ...requestedNodes.map((nodeRequest) => `${formatAttributeName(nodeRequest.kind)}: ${nodeRequest.summary}.`),
    ].filter(Boolean),
  }
}

function adjustAutomatedRecipeFlow(instruction, currentNodes, currentEdges, entityHints = []) {
  const text = String(instruction || '').trim()
  if (!text) throw new Error('Describe what to add, remove, or change.')
  const normalized = normalizeRecipeText(text)

  if (/\b(?:remove|delete|take out|drop|without|no longer)\b/.test(normalized)) {
    return removeAutomatedRecipeParts(text, currentNodes, currentEdges)
  }

  const replacement = parseRecipeReplacement(text)
  if (replacement) {
    return replaceAutomatedRecipeText(replacement, currentNodes, currentEdges)
  }

  const fragment = buildAutomatedRecipeFlow(text, { allowPartial: true, entityHints })
  return appendAutomatedRecipeParts(fragment, currentNodes, currentEdges)
}

function removeAutomatedRecipeParts(instruction, currentNodes, currentEdges) {
  const targets = getRecipeRemovalTargets(instruction)
  const removedIds = new Set()
  for (const node of currentNodes) {
    if (recipeNodeMatchesTargets(node, targets)) removedIds.add(node.id)
  }

  if (!removedIds.size) throw new Error('I could not find a matching node to remove.')

  const nextNodes = currentNodes.filter((node) => !removedIds.has(node.id))
  return {
    nodes: nextNodes,
    edges: rebuildLinearRecipeEdges(nextNodes, currentEdges),
    summary: [`Removed ${removedIds.size} node${removedIds.size === 1 ? '' : 's'}.`],
  }
}

function appendAutomatedRecipeParts(fragment, currentNodes, currentEdges) {
  if (!fragment.nodes.length) throw new Error('I could not find anything to add.')
  const startX = currentNodes.length ? Math.max(...currentNodes.map((node) => Number(node.position?.x || 0))) + 300 : 80
  const appendedNodes = fragment.nodes.map((node, index) => ({
    ...node,
    position: { x: startX + (index * 300), y: 120 },
  }))
  const nextNodes = currentNodes.concat(appendedNodes)
  return {
    nodes: nextNodes,
    edges: rebuildLinearRecipeEdges(nextNodes, currentEdges),
    summary: fragment.summary.length ? fragment.summary.map((item) => `Added ${item.charAt(0).toLowerCase()}${item.slice(1)}`) : [`Added ${appendedNodes.length} node${appendedNodes.length === 1 ? '' : 's'}.`],
  }
}

function replaceAutomatedRecipeText(replacement, currentNodes, currentEdges) {
  let changed = 0
  const oldLabel = formatRecipeLabel(replacement.from)
  const newLabel = formatRecipeLabel(replacement.to)
  const targetText = normalizeRecipeText(replacement.from)
  const durationSeconds = parseRecipeDurationSeconds(replacement.to)
  const timeoutSeconds = parseRecipeTimeoutSeconds(`timeout after ${replacement.to}`) || durationSeconds
  const schedulePoint = parseRecipeTimeFromText(replacement.to)
  const scheduleDays = parseRecipeScheduleDays(normalizeRecipeText(replacement.to))
  const actionPayload = buildRecipeActionPayload(normalizeRecipeText(replacement.to))
  const messageText = extractRecipeQuotedText(replacement.rawTo || replacement.to) || sentenceCaseRecipeText(replacement.to)
  const nextNodes = currentNodes.map((node) => {
    const label = String(node.data?.label || '')
    const nodeMatches = labelMatchesRecipeText(label, replacement.from) || recipeKindMatchesText(node.data?.kind, targetText)
    if (!nodeMatches) return node
    changed += 1
    if (node.data?.kind === 'delay' && durationSeconds) {
      return { ...node, data: { ...node.data, seconds: durationSeconds, label: `Wait ${formatDuration(durationSeconds * 1000)}` } }
    }
    if (node.data?.kind === 'wait' && timeoutSeconds && /\b(?:timeout|time out|wait)\b/.test(targetText)) {
      return { ...node, data: { ...node.data, timeoutSeconds } }
    }
    if (node.data?.kind === 'time' && schedulePoint) {
      return { ...node, data: { ...node.data, scheduleMode: 'at', atType: schedulePoint.type, at: schedulePoint.time, label: `At ${schedulePoint.label}${formatRecipeDaySuffix(scheduleDays)}`, days: scheduleDays.length ? scheduleDays : node.data.days } }
    }
    if (node.data?.kind === 'time' && scheduleDays.length && /\b(?:day|days|weekday|weekdays|weekend|weekends|schedule|time)\b/.test(targetText)) {
      return { ...node, data: { ...node.data, days: scheduleDays, label: `${String(node.data.label || 'Schedule').replace(/\s+On\s+.+$/i, '')}${formatRecipeDaySuffix(scheduleDays)}` } }
    }
    if (node.data?.kind === 'service' && actionPayload !== '{}' && /\b(?:brightness|bright|dim|color|colour|temperature|payload|action|light)\b/.test(targetText)) {
      return { ...node, data: { ...node.data, payload: actionPayload } }
    }
    if (node.data?.kind === 'notify' && /\b(?:message|text|notification|notify|alert)\b/.test(targetText)) {
      return { ...node, data: { ...node.data, message: messageText, label } }
    }
    if (node.data?.kind === 'debug' && /\b(?:message|text|debug|log|trace)\b/.test(targetText)) {
      return { ...node, data: { ...node.data, message: messageText, label } }
    }
    if (node.data?.kind === 'comment' && /\b(?:comment|note|text|message)\b/.test(targetText)) {
      return { ...node, data: { ...node.data, text: messageText, label } }
    }
    const nextLabel = label.replace(new RegExp(escapeRegExp(oldLabel), 'i'), newLabel)
    const nextData = { ...node.data, label: nextLabel === label ? `${label} ${newLabel}`.trim() : nextLabel }
    if (node.data?.kind === 'service') nextData.domain = inferRecipeActionDomain(replacement.to)
    return { ...node, data: nextData }
  })

  if (!changed) throw new Error('I could not find a matching node to change.')
  return {
    nodes: nextNodes,
    edges: currentEdges,
    summary: [`Changed ${oldLabel} to ${newLabel}.`],
  }
}

function getRecipeRemovalTargets(instruction) {
  const conditions = parseRecipeConditions(instruction)
  const actions = parseRecipeActions(instruction)
  const requestedNodes = parseRecipeNodeRequests(instruction)
  const schedule = parseRecipeSchedule(instruction)
  const waitSeconds = parseRecipeWait(instruction)
  const waitUntil = parseRecipeWaitUntil(instruction)
  const normalized = normalizeRecipeText(instruction)
  const explicitKinds = getRecipeNodeKindsFromText(normalized)
  return {
    conditions,
    actions,
    requestedNodes,
    explicitKinds,
    schedule: Boolean(schedule) || /\b(?:time|schedule|window|night|sunset|sunrise|between|before|after)\b/.test(normalized),
    wait: Boolean(waitUntil) || /\b(?:wait until)\b/.test(normalized),
    delay: Boolean(waitSeconds) || /\b(?:delay|timer|pause)\b/.test(normalized),
    rawLabels: cleanupRecipeEntityPhrase(normalized.replace(/\b(?:remove|delete|take out|drop|without|no longer)\b/g, ' ')).split(/\s+and\s+|\s*,\s*/).filter(Boolean),
  }
}

function recipeNodeMatchesTargets(node, targets) {
  const kind = node.data?.kind
  const label = String(node.data?.label || '')
  if (targets.explicitKinds.includes(kind)) return true
  if (targets.schedule && kind === 'time') return true
  if (targets.delay && kind === 'delay') return true
  if (targets.wait && kind === 'wait') return true
  if (targets.actions.some((action) => kind === 'service' && (labelMatchesRecipeText(label, action.label) || node.data?.service === action.service))) return true
  if (targets.conditions.some((condition) => ['state', 'condition'].includes(kind) && labelMatchesRecipeText(label, condition.label))) return true
  if (targets.requestedNodes.some((request) => kind === request.kind || labelMatchesRecipeText(label, request.label))) return true
  return targets.rawLabels.some((target) => target.length > 2 && labelMatchesRecipeText(label, target))
}

function getRecipeNodeKindsFromText(normalized) {
  return AUTOMATED_RECIPE_NODE_KNOWLEDGE
    .filter((item) => item.words.some((word) => normalized.includes(word)))
    .map((item) => item.kind)
}

function splitRecipeElseSections(text) {
  const match = String(text || '').match(/\b(?:otherwise|else|if not|if false)\b/i)
  if (!match) return { primary: text, otherwise: '' }
  return {
    primary: text.slice(0, match.index).trim(),
    otherwise: text.slice((match.index ?? 0) + match[0].length).trim(),
  }
}

function parseRecipeReplacement(instruction) {
  const raw = String(instruction || '')
  const normalized = normalizeRecipeText(raw)
  const match = normalized.match(/\b(?:change|replace|switch|set|update)\s+(.+?)\s+(?:to|with|into)\s+(.+)$/)
  if (!match) return null
  const rawToMatch = raw.match(/\b(?:to|with|into)\s+(.+)$/i)
  return {
    from: cleanupRecipeEntityPhrase(match[1]),
    to: cleanupRecipeEntityPhrase(match[2]),
    rawTo: rawToMatch?.[1]?.trim() || match[2],
  }
}

function rebuildLinearRecipeEdges(nextNodes, currentEdges) {
  const sortedNodes = [...nextNodes].sort((first, second) => (
    Number(first.position?.x || 0) - Number(second.position?.x || 0) ||
    Number(first.position?.y || 0) - Number(second.position?.y || 0)
  ))
  const existingEdgeByPair = new Map(currentEdges.map((edge) => [`${edge.source}-${edge.target}`, edge]))
  const nextEdges = []
  for (let index = 0; index < sortedNodes.length - 1; index += 1) {
    const source = sortedNodes[index]
    const target = sortedNodes[index + 1]
    const existingEdge = existingEdgeByPair.get(`${source.id}-${target.id}`)
    nextEdges.push(existingEdge || {
      id: `${source.id}-${target.id}`,
      source: source.id,
      sourceHandle: source.data?.kind === 'condition' ? 'true' : undefined,
      target: target.id,
      animated: true,
    })
  }
  return nextEdges
}

function parseRecipeConditions(text) {
  const normalized = normalizeRecipeText(text)
  const matches = Array.from(normalized.matchAll(/\b(?:if|when|while|only if|provided)\s+(.+?)\s+(?:is|are|becomes|become|gets|get)\s+(open|opened|closed|on|off|detected|clear|cleared|occupied|unoccupied|home|away|locked|unlocked)\b/g))
  const unique = []
  const addCondition = (phraseValue, stateValue) => {
    const phrase = cleanupRecipeEntityPhrase(phraseValue)
    const state = recipeStateToHomeAssistantState(stateValue)
    if (!phrase) return
    const label = formatRecipeLabel(phrase)
    if (unique.some((condition) => condition.label.toLowerCase() === label.toLowerCase() && condition.state === state)) return
    unique.push({ label, state, requestedState: normalizeRecipeText(stateValue), stateLabel: recipeStateDisplayLabel(stateValue) })
  }

  for (const match of matches) {
    addCondition(match[1], match[2])
  }

  const chainedMatches = Array.from(normalized.matchAll(/\b(?:and|or|with)\s+(.+?)\s+(?:is|are|becomes|become|gets|get)\s+(open|opened|closed|on|off|detected|clear|cleared|occupied|unoccupied|home|away|locked|unlocked)\b/g))
  for (const match of chainedMatches) {
    addCondition(match[1], match[2])
  }

  const verbMatches = Array.from(normalized.matchAll(/\b(?:if|when|while|only if|provided|and|or|with)\s+(.+?)\s+(opens|closes|turns on|turns off|detects|clears|locks|unlocks)\b/g))
  for (const match of verbMatches) {
    addCondition(match[1], recipeVerbToState(match[2]))
  }

  const shorthandMatches = Array.from(normalized.matchAll(/\b(?:if|when|while|only if|provided)\s+(.+?)\s+(open|opened|closed|detected|clear|cleared|occupied|unoccupied|locked|unlocked)\b/g))
  for (const match of shorthandMatches) {
    addCondition(match[1], match[2])
  }

  return unique
}

function parseRecipeActions(text) {
  const normalized = normalizeRecipeText(text)
  const matches = Array.from(normalized.matchAll(/\b(?:turn|switch)\s+(on|off)\s+(.+?)(?=\s+\b(?:but|only|if|when|while|between|after|before|provided|then)\b|[,.]|$)/g))
  const serviceMatches = Array.from(normalized.matchAll(/\bcall\s+([a-z0-9_]+)\.([a-z0-9_]+)(?:\s+(?:on|for)\s+(.+?))?(?=\s+\b(?:but|only|if|when|while|between|after|before|provided|then)\b|[,.]|$)/g))
  const commandMatches = Array.from(normalized.matchAll(/\b(open|close|lock|unlock)\s+(.+?)(?=\s+\b(?:but|only|if|when|while|between|after|before|provided|then)\b|[,.]|$)/g))
  const setMatches = Array.from(normalized.matchAll(/\bset\s+(.+?)\s+to\s+(.+?)(?=\s+\b(?:but|only|if|when|while|between|after|before|provided|then)\b|[,.]|$)/g))
  const actionPayload = buildRecipeActionPayload(normalized)
  const actions = []
  let lastTarget = ''

  for (const match of matches) {
    const service = match[1] === 'on' ? 'turn_on' : 'turn_off'
    let phrase = cleanupRecipeActionPhrase(match[2])
    if (isRecipePronounTarget(phrase)) phrase = lastTarget
    if (!phrase) continue
    lastTarget = phrase
    actions.push({
      domain: inferRecipeActionDomain(phrase),
      label: formatRecipeLabel(phrase),
      payload: actionPayload,
      service,
    })
  }

  for (const match of serviceMatches) {
    let phrase = cleanupRecipeActionPhrase(match[3] || `${match[1]} ${match[2]}`)
    if (isRecipePronounTarget(phrase)) phrase = lastTarget
    if (!phrase) continue
    lastTarget = phrase
    actions.push({
      domain: match[1],
      label: formatRecipeLabel(phrase),
      payload: actionPayload,
      service: match[2],
    })
  }

  for (const match of commandMatches) {
    let phrase = cleanupRecipeActionPhrase(match[2])
    if (isRecipePronounTarget(phrase)) phrase = lastTarget
    if (phrase) lastTarget = phrase
    const commandAction = buildRecipeCommandAction(match[1], phrase, actionPayload)
    if (commandAction) actions.push(commandAction)
  }

  for (const match of setMatches) {
    const setAction = buildRecipeSetAction(match[1], match[2])
    if (setAction) actions.push(setAction)
  }

  return dedupeRecipeActions(actions)
}

function parseRecipeSchedule(text) {
  const normalized = normalizeRecipeText(text)
  const days = parseRecipeScheduleDays(normalized)
  const between = normalized.match(/\bbetween\s+(sunset|sunrise|\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s+and\s+(sunset|sunrise|\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/)
  if (between) {
    const start = parseRecipeSchedulePoint(between[1])
    const end = parseRecipeSchedulePoint(between[2])
    const daySuffix = formatRecipeDaySuffix(days)
    return {
      label: `Between ${start.label} And ${end.label}${daySuffix}`,
      data: {
        scheduleMode: 'between',
        startType: start.type,
        startTime: start.time,
        endType: end.type,
        endTime: end.time,
        days,
      },
    }
  }

  if (/\b(?:at night|overnight|after sunset|before sunrise|sunset to sunrise)\b/.test(normalized)) {
    const daySuffix = formatRecipeDaySuffix(days)
    return {
      label: `Between Sunset And Sunrise${daySuffix}`,
      data: { scheduleMode: 'between', startType: 'sunset', startTime: '19:00', endType: 'sunrise', endTime: '07:00', days },
    }
  }

  const atTime = normalized.match(/\bat\s+(sunrise|sunset|\d{1,2}:\d{2}\s*(?:am|pm)?|\d{1,2}\s*(?:am|pm))\b/)
  if (atTime) {
    const point = parseRecipeSchedulePoint(atTime[1])
    const daySuffix = formatRecipeDaySuffix(days)
    return {
      label: `At ${point.label}${daySuffix}`,
      data: { scheduleMode: 'at', atType: point.type, at: point.time, days },
    }
  }

  return null
}

function parseRecipeSchedulePoint(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'sunset' || normalized === 'sunrise') return { type: normalized, time: normalized === 'sunset' ? '19:00' : '07:00', label: formatAttributeName(normalized) }
  const time = normalizeRecipeTime(normalized)
  if (!time) return { type: 'time', time: '07:00', label: '07:00' }
  return { type: 'time', time, label: time }
}

function parseRecipeScheduleDays(normalized) {
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

function formatRecipeDaySuffix(days) {
  const label = formatScheduleDays(days)
  return label ? ` On ${label}` : ''
}

function parseRecipeWait(text) {
  const match = normalizeRecipeNumbers(text).match(/\b(?:delay|pause|wait|after|for)\s+(\d+)\s+(second|seconds|minute|minutes|hour|hours)\b/)
  if (!match) return 0
  const amount = Number(match[1])
  const unit = match[2]
  if (unit.startsWith('hour')) return amount * 3600
  if (unit.startsWith('minute')) return amount * 60
  return amount
}

function parseRecipeWaitUntil(text) {
  const normalized = normalizeRecipeText(text)
  const match = normalized.match(/\bwait\s+until\s+(.+?)\s+(?:is|are|becomes|become|gets|get)\s+(open|opened|closed|on|off|detected|clear|cleared|occupied|unoccupied|home|away|locked|unlocked)\b/)
  if (!match) return null
  const label = formatRecipeLabel(match[1])
  const state = recipeStateToHomeAssistantState(match[2])
  const timeoutSeconds = parseRecipeTimeoutSeconds(normalized) || 300
  return {
    label: `Wait Until ${label} Is ${formatStateOption(state)}`,
    data: { entityId: '', attribute: 'state', to: state, timeoutSeconds },
    summary: `${label} is ${formatStateOption(state)} for up to ${formatDuration(timeoutSeconds * 1000)}`,
  }
}

function parseRecipeNodeRequests(text) {
  const normalized = normalizeRecipeText(text)
  const requests = []
  const addRequest = (request) => {
    if (!request) return
    if (requests.some((item) => item.kind === request.kind && item.label === request.label)) return
    requests.push(request)
  }

  addRequest(parseRecipeEventNode(normalized))
  addRequest(parseRecipeNotifyNode(text))
  addRequest(parseRecipeSceneNode(text))
  addRequest(parseRecipeDebugNode(text))
  addRequest(parseRecipeCommentNode(text))
  addRequest(parseRecipeEndNode(normalized))
  addRequest(parseRecipeJoinNode(normalized))
  addRequest(parseRecipeDirectionNode(normalized))
  addRequest(parseRecipeGroupNode(normalized))

  return requests
}

function parseRecipeEventNode(normalized) {
  if (!/\b(?:event|home assistant event|state changed event)\b/.test(normalized)) return null
  const eventTypeMatch = normalized.match(/\bevent(?: type)?\s+([a-z0-9_]+)\b/)
  const eventType = eventTypeMatch?.[1] || 'state_changed'
  return {
    kind: 'event',
    label: eventType === 'state_changed' ? 'Home Assistant Event' : `${formatRecipeLabel(eventType)} Event`,
    data: { eventType, entityId: '', from: '', to: '' },
    summary: `listen for ${eventType}`,
  }
}

function parseRecipeNotifyNode(text) {
  const normalized = normalizeRecipeText(text)
  if (!/\b(?:notify|notification|alert|message me|send me|send a message)\b/.test(normalized)) return null
  const message = extractRecipeQuotedText(text) || extractRecipeMessageText(normalized) || 'HAFlow ran'
  return {
    kind: 'notify',
    label: 'Send Notification',
    data: { message, notifyService: '', target: '', title: '', dataJson: '{}', pushoverPriority: '', pushoverSound: '' },
    summary: `send notification "${message}"`,
  }
}

function parseRecipeSceneNode(text) {
  const normalized = normalizeRecipeText(text)
  if (!/\b(?:scene|activate scene|turn on scene)\b/.test(normalized)) return null
  const sceneMatch = normalized.match(/\b(?:activate|turn on|run|start)?\s*scene\s+(.+?)(?=\s+\b(?:then|and|but|only|if|when|while|between|after|before)\b|$)/)
  const sceneName = cleanupRecipeEntityPhrase(sceneMatch?.[1] || '')
  return {
    kind: 'scene',
    label: sceneName ? `Turn On ${formatRecipeLabel(sceneName)} Scene` : 'Turn On Scene',
    data: { entityId: '' },
    summary: sceneName ? `turn on ${formatRecipeLabel(sceneName)} scene` : 'turn on a scene',
  }
}

function parseRecipeDebugNode(text) {
  const normalized = normalizeRecipeText(text)
  if (!/\b(?:debug|log|trace)\b/.test(normalized)) return null
  const message = extractRecipeQuotedText(text) || extractRecipeMessageText(normalized) || 'Reached debug node'
  return {
    kind: 'debug',
    label: 'Debug Log',
    data: { message },
    summary: `write "${message}" to the run log`,
  }
}

function parseRecipeCommentNode(text) {
  const normalized = normalizeRecipeText(text)
  if (!/\b(?:comment|note|annotation)\b/.test(normalized)) return null
  const note = extractRecipeQuotedText(text) || normalized.replace(/\b(?:add|create|a|an|comment|note|annotation|that|says|saying)\b/g, ' ').replace(/\s+/g, ' ').trim() || 'Add a note about this flow.'
  return {
    kind: 'comment',
    label: 'Comment',
    data: { text: sentenceCaseRecipeText(note) },
    summary: sentenceCaseRecipeText(note),
  }
}

function parseRecipeEndNode(normalized) {
  if (!/\b(?:end|stop branch|stop here|finish branch)\b/.test(normalized)) return null
  return {
    kind: 'end',
    label: 'End',
    data: {},
    summary: 'end this branch',
  }
}

function parseRecipeJoinNode(normalized) {
  if (/\b(?:or node|either path|any path|any incoming)\b/.test(normalized)) {
    return { kind: 'or', label: 'OR', data: {}, summary: 'continue when any incoming path reaches it' }
  }
  if (/\b(?:and node|all paths|both paths|all incoming)\b/.test(normalized)) {
    return { kind: 'and', label: 'AND', data: { activeStates: DIRECTION_ACTIVE_STATES }, summary: 'continue when all incoming paths are active' }
  }
  return null
}

function parseRecipeDirectionNode(normalized) {
  if (!/\b(?:direction|movement|motion direction|a to b|b to a|in out|in or out)\b/.test(normalized)) return null
  return {
    kind: 'direction',
    label: 'Direction',
    data: { entityA: '', entityB: '', activeStates: DIRECTION_ACTIVE_STATES, directionAB: 'in', directionBA: 'out', targetEntityId: '' },
    summary: 'compare two active entities and write the direction',
  }
}

function parseRecipeGroupNode(normalized) {
  if (!/\b(?:group|subflow|frame)\b/.test(normalized)) return null
  return {
    kind: 'group',
    label: 'Subflow',
    data: {},
    summary: 'frame related nodes as a same-screen subflow',
  }
}

function recipeStateToHomeAssistantState(value) {
  const normalized = normalizeRecipeText(value)
  const stateMap = {
    open: 'on',
    opened: 'on',
    closed: 'off',
    detected: 'on',
    clear: 'off',
    cleared: 'off',
    occupied: 'on',
    unoccupied: 'off',
    home: 'home',
    away: 'not_home',
    locked: 'locked',
    unlocked: 'unlocked',
    on: 'on',
    off: 'off',
  }
  return stateMap[normalized] || normalized
}

function recipeStateDisplayLabel(value) {
  const normalized = normalizeRecipeText(value)
  const labelMap = {
    open: 'Open',
    opened: 'Open',
    opens: 'Open',
    closed: 'Closed',
    closes: 'Closed',
    detected: 'Detected',
    clear: 'Clear',
    cleared: 'Clear',
    occupied: 'Occupied',
    unoccupied: 'Unoccupied',
    home: 'Home',
    away: 'Away',
    locked: 'Locked',
    unlocked: 'Unlocked',
    on: 'On',
    off: 'Off',
    'turns on': 'On',
    'turns off': 'Off',
  }
  return labelMap[normalized] || formatStateOption(normalized)
}

function recipeVerbToState(value) {
  const normalized = normalizeRecipeText(value)
  const stateMap = {
    opens: 'open',
    closes: 'closed',
    'turns on': 'on',
    'turns off': 'off',
    detects: 'detected',
    clears: 'clear',
    locks: 'locked',
    unlocks: 'unlocked',
  }
  return stateMap[normalized] || normalized
}

function oppositeState(state) {
  const opposite = { on: 'off', off: 'on', open: 'closed', closed: 'open', locked: 'unlocked', unlocked: 'locked', home: 'not_home', not_home: 'home' }
  return opposite[state] || ''
}

function cleanupRecipeEntityPhrase(value) {
  return normalizeRecipeText(value)
    .replace(/\b(?:the|a|an|my|our|that|this|to|from|then|and|or|is|are|becomes|become|gets|get)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanupRecipeActionPhrase(value) {
  return cleanupRecipeEntityPhrase(value)
    .replace(/\b(?:at|brightness|bright|dimmed?|color|colour|temperature|kelvin|percent|pct|rgb)\b.*$/g, ' ')
    .replace(/\b\d{1,3}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isRecipePronounTarget(value) {
  return /^(?:it|them|that|this|same one|same thing)$/.test(normalizeRecipeText(value))
}

function formatRecipeLabel(value) {
  return cleanupRecipeEntityPhrase(value).split(' ').filter(Boolean).map(formatAttributeName).join(' ')
}

function labelMatchesRecipeText(label, target) {
  const normalizedLabel = normalizeRecipeText(label)
  const normalizedTarget = normalizeRecipeText(target)
  if (!normalizedTarget) return false
  if (normalizedLabel.includes(normalizedTarget)) return true
  const targetTokens = normalizedTarget.split(' ').filter((token) => token.length > 2)
  return targetTokens.length > 0 && targetTokens.every((token) => normalizedLabel.includes(token))
}

function recipeKindMatchesText(kind, text) {
  if (!kind) return false
  return AUTOMATED_RECIPE_NODE_KNOWLEDGE
    .find((item) => item.kind === kind)
    ?.words.some((word) => text.includes(word)) || text.includes(kind)
}

function extractRecipeQuotedText(value) {
  const match = String(value || '').match(/["'](.+?)["']/)
  return match?.[1]?.trim() || ''
}

function extractRecipeMessageText(normalized) {
  const match = normalized.match(/\b(?:message|says|say|with text|text)\s+(.+)$/)
  return match?.[1] ? sentenceCaseRecipeText(match[1]) : ''
}

function sentenceCaseRecipeText(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function parseRecipeDurationSeconds(value) {
  const match = normalizeRecipeNumbers(value).match(/\b(\d+)\s*(second|seconds|minute|minutes|hour|hours)\b/)
  if (!match) return 0
  const amount = Number(match[1])
  if (match[2].startsWith('hour')) return amount * 3600
  if (match[2].startsWith('minute')) return amount * 60
  return amount
}

function parseRecipeTimeoutSeconds(value) {
  const normalized = normalizeRecipeNumbers(value)
  const match = normalized.match(/\b(?:timeout|time out|give up|stop waiting)\s+(?:after|in)?\s*(\d+)\s*(second|seconds|minute|minutes|hour|hours)\b/)
    || normalized.match(/\bfor up to\s+(\d+)\s*(second|seconds|minute|minutes|hour|hours)\b/)
  if (!match) return 0
  return parseRecipeDurationSeconds(`${match[1]} ${match[2]}`)
}

function parseRecipeTimeFromText(value) {
  const normalized = normalizeRecipeText(value)
  const match = normalized.match(/\b(sunrise|sunset|\d{1,2}:\d{2}\s*(?:am|pm)?|\d{1,2}\s*(?:am|pm))\b/)
  return match ? parseRecipeSchedulePoint(match[1]) : null
}

function buildRecipeActionPayload(normalized) {
  const payload = {}
  const brightness = normalized.match(/\b(?:brightness|bright|dimmed?|at)\s+(?:to\s+)?(\d{1,3})\s*(?:percent|pct|%)\b/)
  if (brightness) payload.brightness_pct = Math.max(0, Math.min(100, Number(brightness[1])))

  const kelvin = normalized.match(/\b(?:color temperature|temperature|kelvin)\s+(?:to\s+)?(\d{3,5})\s*(?:k|kelvin)?\b/)
  if (kelvin) payload.color_temp_kelvin = Number(kelvin[1])

  const color = parseRecipeColor(normalized)
  if (color) payload.rgb_color = color

  return Object.keys(payload).length ? JSON.stringify(payload, null, 2) : '{}'
}

function parseRecipeColor(normalized) {
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
  if (hex) {
    const value = hex[1]
    return [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16))
  }
  const rgb = normalized.match(/\brgb\s*(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})\b/)
  if (rgb) return [1, 2, 3].map((index) => Math.max(0, Math.min(255, Number(rgb[index]))))
  const colorMatch = normalized.match(/\b(?:color|colour)\s+(?:to\s+)?([a-z]+)\b/)
  const colorName = colorMatch?.[1] || Object.keys(colorMap).find((name) => new RegExp(`\\b${name}\\b`).test(normalized))
  return colorName ? colorMap[colorName] : null
}

function buildRecipeCommandAction(command, value, actionPayload = '{}') {
  const phrase = cleanupRecipeActionPhrase(value)
  if (!phrase) return null
  const domain = inferRecipeCommandDomain(command, phrase)
  const service = getRecipeCommandService(command, domain)
  return {
    domain,
    label: formatRecipeLabel(phrase),
    payload: actionPayload,
    service,
  }
}

function buildRecipeSetAction(targetValue, value) {
  const target = cleanupRecipeActionPhrase(targetValue)
  const normalizedTarget = normalizeRecipeText(targetValue)
  const normalizedValue = normalizeRecipeText(value)
  if (!target) return null

  if (/\b(?:thermostat|temperature|climate|heat|ac|air conditioner)\b/.test(normalizedTarget)) {
    const temperature = normalizedValue.match(/\b(\d{2,3})(?:\s*degrees?)?\b/)
    return {
      domain: 'climate',
      label: formatRecipeLabel(target),
      payload: temperature ? JSON.stringify({ temperature: Number(temperature[1]) }, null, 2) : '{}',
      service: 'set_temperature',
    }
  }

  if (/\bfan\b/.test(normalizedTarget)) {
    const percentage = normalizedValue.match(/\b(\d{1,3})\s*(?:percent|pct|%)?\b/)
    return {
      domain: 'fan',
      label: formatRecipeLabel(target),
      payload: percentage ? JSON.stringify({ percentage: Math.max(0, Math.min(100, Number(percentage[1]))) }, null, 2) : '{}',
      service: 'set_percentage',
    }
  }

  return {
    domain: inferRecipeActionDomain(target),
    label: formatRecipeLabel(target),
    payload: buildRecipeActionPayload(`${normalizedTarget} ${normalizedValue}`),
    service: 'turn_on',
  }
}

function inferRecipeCommandDomain(command, phrase) {
  const normalized = normalizeRecipeText(phrase)
  if (['lock', 'unlock'].includes(command)) return 'lock'
  if (/\b(?:garage|cover|blind|blinds|shade|shades|curtain|curtains|door|gate|window)\b/.test(normalized)) return 'cover'
  return inferRecipeActionDomain(phrase)
}

function getRecipeCommandService(command, domain) {
  if (domain === 'lock') return command === 'unlock' ? 'unlock' : 'lock'
  if (domain === 'cover') return command === 'close' ? 'close_cover' : 'open_cover'
  return ['close', 'lock'].includes(command) ? 'turn_off' : 'turn_on'
}

function dedupeRecipeActions(actions) {
  const seen = new Set()
  return actions.filter((action) => {
    const key = `${action.domain}.${action.service}:${action.label}:${action.payload}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function inferRecipeActionDomain(value) {
  const normalized = normalizeRecipeText(value)
  if (/\b(?:thermostat|climate|heat|ac|air conditioner)\b/.test(normalized)) return 'climate'
  if (/\b(?:garage|cover|blind|blinds|shade|shades|curtain|curtains)\b/.test(normalized)) return 'cover'
  if (/\b(?:lock|deadbolt)\b/.test(normalized)) return 'lock'
  if (/\bfan\b/.test(normalized)) return 'fan'
  if (/\b(?:helper|boolean|input boolean)\b/.test(normalized)) return 'input_boolean'
  if (/\bswitch\b/.test(normalized)) return 'switch'
  return 'light'
}

function normalizeRecipeText(value) {
  return String(value || '').toLowerCase().replace(/[_-]/g, ' ').replace(/[^\w\s:#%]/g, ' ').replace(/\s+/g, ' ').trim()
}

function normalizeRecipeNumbers(value) {
  const numberWords = {
    zero: 0,
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
    thirteen: 13,
    fourteen: 14,
    fifteen: 15,
    sixteen: 16,
    seventeen: 17,
    eighteen: 18,
    nineteen: 19,
    twenty: 20,
    thirty: 30,
    forty: 40,
    fifty: 50,
    sixty: 60,
    ninety: 90,
  }
  return normalizeRecipeText(value).replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|ninety)\b/g, (word) => String(numberWords[word]))
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeRecipeTime(value) {
  const match = String(value || '').trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/)
  if (!match) return ''
  let hours = Number(match[1])
  const minutes = Number(match[2] || 0)
  if (match[3] === 'pm' && hours < 12) hours += 12
  if (match[3] === 'am' && hours === 12) hours = 0
  if (hours > 23 || minutes > 59) return ''
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function titleFromRecipeText(text) {
  const words = normalizeRecipeText(text).split(' ').filter(Boolean).slice(0, 7)
  return words.length ? words.map(formatAttributeName).join(' ') : 'Generated Recipe'
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
  const [selectedEntityType, setSelectedEntityType] = useState('')
  const [selectedEntityState, setSelectedEntityState] = useState('')
  const [selectedEntityUsage, setSelectedEntityUsage] = useState('all')
  const [viewport, setViewport] = useState(defaultViewport)
  const [showLastRunSnapshot, setShowLastRunSnapshot] = useState(false)
  const [theme, setTheme] = useState(getInitialTheme)
  const [isInspectorCollapsed, setIsInspectorCollapsed] = useState(getInitialInspectorCollapsed)
  const [isLibraryCollapsed, setIsLibraryCollapsed] = useState(getInitialLibraryCollapsed)
  const [isRunHistoryCollapsed, setIsRunHistoryCollapsed] = useState(getInitialRunHistoryCollapsed)
  const [isLogModalOpen, setIsLogModalOpen] = useState(false)
  const [isRecipeModalOpen, setIsRecipeModalOpen] = useState(false)
  const [isVoiceSetupModalOpen, setIsVoiceSetupModalOpen] = useState(false)
  const [selectedRecipeId, setSelectedRecipeId] = useState(FLOW_RECIPES[0]?.id || '')
  const [recipeValues, setRecipeValues] = useState({})
  const [recipeDescription, setRecipeDescription] = useState('')
  const [recipeDescriptionResult, setRecipeDescriptionResult] = useState(null)
  const [recipeVoiceStatus, setRecipeVoiceStatus] = useState('idle')
  const [voiceSetupBaseUrl, setVoiceSetupBaseUrl] = useState(getDefaultVoiceSetupBaseUrl)
  const [voiceSetupResult, setVoiceSetupResult] = useState(null)
  const [logQuery, setLogQuery] = useState('')
  const [nodeTestResult, setNodeTestResult] = useState(null)
  const [isFlowMenuOpen, setIsFlowMenuOpen] = useState(false)
  const isDarkTheme = theme === 'dark'
  const { screenToFlowPosition, setViewport: setReactFlowViewport, getViewport } = useReactFlow()

  const selectedNode = nodes.find((node) => node.id === selectedId)
  const selectedNodeIdSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds])
  const hasNodeSelection = selectedNodeIds.length > 0
  const activeFlow = flows.find((flow) => flow.id === activeFlowId)
  const selectedRecipe = FLOW_RECIPES.find((recipe) => recipe.id === selectedRecipeId) ?? FLOW_RECIPES[0]
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
  const canDictateRecipe = Boolean(SpeechRecognition)
  const voiceSetupYaml = useMemo(() => buildVoiceSetupYaml(voiceSetupBaseUrl), [voiceSetupBaseUrl])
  const notifyServiceOptions = useMemo(() => {
    const names = services.notify ? Object.keys(services.notify).sort() : []
    return [{ value: '', label: 'Default notification service' }, ...names.map((name) => ({ value: name, label: `notify.${name}` }))]
  }, [services])
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
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes])
  const displayNodes = useMemo(() => nodes.map((node) => ({
    ...node,
    selected: selectedNodeIdSet.has(node.id),
    data: {
      ...enrichNodeDisplayData(node.data, entityById, nodeRuntime[node.id], runtimeClock, isInLastRunSnapshot(node.id)),
      groupDeviceName: node.data?.kind === 'group' ? getGroupDeviceName(node, nodes, entityById) : undefined,
      suppressValidation: shouldSuppressNodeValidation(node, nodeById),
    },
  })), [entityById, isInLastRunSnapshot, nodeById, nodeRuntime, nodes, runtimeClock, selectedNodeIdSet])
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
  const flowEntityIdSet = useMemo(() => new Set(collectFlowEntityIds(nodes)), [nodes])
  const entityTypeOptions = useMemo(() => {
    return Array.from(new Set(entities.map((entity) => entity.deviceType || entity.entity_id?.split('.')[0]).filter(Boolean))).sort((first, second) => first.localeCompare(second))
  }, [entities])
  const entityStateOptions = useMemo(() => {
    return Array.from(new Set(entities
      .filter((entity) => isSelectableEntity(entity))
      .map((entity) => entity.state)
      .filter(Boolean)))
      .sort((first, second) => formatStateOption(first).localeCompare(formatStateOption(second)))
  }, [entities])
  const groupedEntities = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const filtered = entities
      .filter((entity) => {
        const type = entity.deviceType || entity.entity_id?.split('.')[0] || ''
        const isUsedInFlow = flowEntityIdSet.has(entity.entity_id) || (entity.deviceId && flowEntityIdSet.has(`device.${entity.deviceId}`))
        if (selectedEntityType && type !== selectedEntityType) return false
        if (selectedEntityState && entity.state !== selectedEntityState) return false
        if (selectedEntityUsage === 'used' && !isUsedInFlow) return false
        if (selectedEntityUsage === 'unused' && isUsedInFlow) return false
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
  }, [entities, flowEntityIdSet, query, selectedEntityState, selectedEntityType, selectedEntityUsage])
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
    if (!selectedRecipe) return
    setRecipeValues((current) => {
      const next = { ...current }
      for (const field of selectedRecipe.fields) {
        if (next[field.id]) continue
        if (field.type === 'text') next[field.id] = field.defaultValue || ''
        if (field.type === 'choice') next[field.id] = field.defaultValue || field.options?.[0]?.value || ''
        if (field.type === 'notifyService') next[field.id] = notifyServiceOptions[0]?.value ?? ''
        if (field.type === 'entity') {
          const match = entities.find((entity) => recipeEntityMatchesField(entity, field))
          next[field.id] = match?.entity_id || ''
        }
      }
      return next
    })
  }, [entities, notifyServiceOptions, selectedRecipe])

  useEffect(() => {
    setNodeTestResult(null)
  }, [selectedId])

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

  const onConnect = useCallback((params) => {
    const sourceNode = nodes.find((node) => node.id === params.source)
    const targetNode = nodes.find((node) => node.id === params.target)
    const shouldSwapDirection = sourceNode?.data?.kind === 'end' && targetNode?.data?.kind !== 'end'
    const connectionParams = shouldSwapDirection
      ? {
        source: params.target,
        sourceHandle: params.targetHandle,
        target: params.source,
        targetHandle: params.sourceHandle,
      }
      : params

    if (!connectionParams.source || !connectionParams.target || connectionParams.source === connectionParams.target) return
    setEdges((eds) => addEdge({ ...connectionParams, animated: true }, eds))
  }, [nodes, setEdges])

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
      const patch = {
        entityIds,
        entityId: entityIds[0] ?? '',
        label: entityIds.length === 0 ? getCatalogLabel(selectedNode.data.kind) : entityIds.length === 1 ? (entities.find((item) => item.entity_id === entityIds[0])?.friendlyName || entityIds[0]) : `${entityIds.length} Actions`,
      }
      if (!entityIds.length) {
        patch.domain = ''
        patch.service = ''
        patch.payload = '{}'
      } else {
        Object.assign(patch, getActionServicePatch(entityIds, selectedNode.data.service, services))
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

    if (selectedNode.data.kind === 'direction') {
      if (['input_text', 'input_select'].includes(entity.domain)) {
        updateNodeData({ targetEntityId: entity.entity_id })
        return
      }
      if (selectedNode.data.entityA === entity.entity_id) {
        updateNodeData({ entityA: '' })
        return
      }
      if (selectedNode.data.entityB === entity.entity_id) {
        updateNodeData({ entityB: '' })
        return
      }
      if (!selectedNode.data.entityA) {
        updateNodeData({ entityA: entity.entity_id, label: selectedNode.data.label || 'Direction' })
        return
      }
      updateNodeData({ entityB: entity.entity_id })
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
    const baseName = newFlowName.trim() || (duplicate ? `${activeFlow?.name || 'Flow'} Copy` : 'New Flow')
    const name = getUniqueFlowName(baseName, flows)
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

  const renameFlow = async () => {
    const requestedName = newFlowName.trim()
    if (!requestedName || !activeFlow) return
    const name = getUniqueFlowName(requestedName, flows, activeFlowId)
    const response = await apiFetch(`/api/flows/${activeFlowId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    const result = await response.json()
    setFlows(result.flows ?? [])
    setNewFlowName('')
    setLogs((current) => [{ time: new Date().toISOString(), level: 'info', message: `Renamed flow to ${result.flow?.name || name}.` }, ...current])
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

  const copyVoiceSetupYaml = async () => {
    try {
      await navigator.clipboard.writeText(voiceSetupYaml)
      setVoiceSetupResult({ status: 'pass', title: 'YAML copied', details: ['Paste it into Home Assistant configuration.yaml, then check configuration and restart Home Assistant.'] })
    } catch (error) {
      setVoiceSetupResult({ status: 'warn', title: 'Copy failed', details: [error.message] })
    }
  }

  const testVoiceSetupApi = async () => {
    setVoiceSetupResult({ status: 'loading', title: 'Testing voice API', details: ['Calling the HAFlow voice recipe endpoint.'] })
    try {
      const response = await apiFetch('/api/voice/recipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipe: 'when test trigger is on turn on test light', dryRun: true }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Voice API test failed.')
      setVoiceSetupResult({ status: 'pass', title: 'Voice API works', details: result.summary?.length ? result.summary : ['HAFlow understood the test recipe without creating a flow.'] })
    } catch (error) {
      setVoiceSetupResult({ status: 'error', title: 'Voice API test failed', details: [error.message] })
    }
  }

  const saveRecipeFlow = async (baseName, generated, successMessage) => {
    if (!generated.nodes.length) throw new Error('Recipe did not create any nodes.')
    const flowName = getUniqueFlowName(baseName, flows)
    const createResponse = await apiFetch('/api/flows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: flowName }),
    })
    const createResult = await createResponse.json()
    if (!createResponse.ok) throw new Error(createResult.error || 'Recipe flow could not be created.')
    const flowId = createResult.flow.id
    const viewport = { x: 0, y: 0, zoom: 0.85 }
    const saveResponse = await apiFetch(`/api/flows/${flowId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...generated, viewport }),
    })
    const saveResult = await saveResponse.json()
    if (!saveResponse.ok) throw new Error(saveResult.error || 'Recipe flow could not be saved.')
    setFlows(createResult.flows ?? [])
    setIsRecipeModalOpen(false)
    await loadFlow(flowId)
    setLogs((current) => [{ time: new Date().toISOString(), level: 'info', message: successMessage(flowName) }, ...current])
  }

  const createRecipeFlow = async () => {
    if (!selectedRecipe) return
    const missingField = selectedRecipe.fields.find((field) => !recipeValues[field.id])
    if (missingField) {
      setLogs((current) => [{ time: new Date().toISOString(), level: 'warn', message: `Choose ${missingField.label} before creating this recipe.` }, ...current])
      return
    }

    try {
      const generated = buildRecipeFlow(selectedRecipe, recipeValues, entities)
      await saveRecipeFlow(selectedRecipe.name, generated, (flowName) => `Created ${flowName} from the ${selectedRecipe.name} recipe.`)
    } catch (error) {
      setLogs((current) => [{ time: new Date().toISOString(), level: 'error', message: error.message }, ...current])
    }
  }

  const createAutomatedRecipeFlow = async () => {
    setRecipeDescriptionResult(null)
    try {
      const generated = buildAutomatedRecipeFlow(recipeDescription, { entityHints: buildRecipeEntityHints(entities) })
      await saveRecipeFlow(generated.flowName, generated, (flowName) => `Created ${flowName} from the described recipe.`)
      setRecipeDescription('')
    } catch (error) {
      setRecipeDescriptionResult({ status: 'error', title: 'Recipe needs more detail', details: [error.message] })
      setLogs((current) => [{ time: new Date().toISOString(), level: 'warn', message: error.message }, ...current])
    }
  }

  const dictateRecipeDescription = () => {
    if (!SpeechRecognition) {
      setRecipeDescriptionResult({ status: 'warn', title: 'Speech not available', details: ['This browser does not support built-in speech recognition.'] })
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = navigator.language || 'en-US'
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    setRecipeVoiceStatus('listening')
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim()
      if (transcript) {
        setRecipeDescription((current) => `${current.trim()}${current.trim() ? ' ' : ''}${transcript}`.trim())
        setRecipeDescriptionResult(null)
      }
    }
    recognition.onerror = (event) => {
      setRecipeDescriptionResult({ status: 'warn', title: 'Speech stopped', details: [event.error || 'Speech recognition did not return text.'] })
    }
    recognition.onend = () => setRecipeVoiceStatus('idle')
    recognition.start()
  }

  const adjustCurrentRecipeFlow = () => {
    setRecipeDescriptionResult(null)
    try {
      const generated = adjustAutomatedRecipeFlow(recipeDescription, nodes, edges, buildRecipeEntityHints(entities))
      setNodes(generated.nodes)
      setEdges(generated.edges)
      setSelectedId(null)
      setSelectedNodeIds([])
      setSelectedEdgeId(null)
      setSaveStatus('dirty')
      setRecipeDescriptionResult({ status: 'pass', title: 'Current flow adjusted', details: generated.summary })
      setLogs((current) => [{ time: new Date().toISOString(), level: 'info', message: `Adjusted ${activeFlow?.name || 'current flow'} from the described recipe change.` }, ...current])
    } catch (error) {
      setRecipeDescriptionResult({ status: 'error', title: 'Adjustment needs more detail', details: [error.message] })
      setLogs((current) => [{ time: new Date().toISOString(), level: 'warn', message: error.message }, ...current])
    }
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

  const testSelectedNode = async () => {
    if (!selectedNode) return
    setNodeTestResult({ status: 'loading', title: 'Testing node', details: ['Checking current Home Assistant state.'] })
    try {
      const response = await apiFetch('/api/node-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node: selectedNode, nodes, edges }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Node test failed.')
      setNodeTestResult(result)
    } catch (error) {
      setNodeTestResult({ status: 'error', title: 'Test failed', details: [error.message] })
    }
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
          <div className="flow-select-menu" onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setIsFlowMenuOpen(false)
          }}>
            <button
              aria-expanded={isFlowMenuOpen}
              className="flow-select-trigger"
              onClick={() => setIsFlowMenuOpen((current) => !current)}
              type="button"
            >
              <span>
                {activeFlow?.paused ? <span className="paused-token">[Paused]</span> : null}
                {activeFlow?.name || 'Select flow'}
              </span>
              <ChevronDown size={16} />
            </button>
            {isFlowMenuOpen ? (
              <div className="flow-select-options" role="listbox">
                {sortedFlows.map((flow) => (
                  <button
                    aria-selected={flow.id === activeFlowId}
                    className={flow.id === activeFlowId ? 'is-active' : ''}
                    key={flow.id}
                    onClick={() => {
                      loadFlow(flow.id)
                      setIsFlowMenuOpen(false)
                    }}
                    role="option"
                    type="button"
                  >
                    {flow.paused ? <span className="paused-token">[Paused]</span> : null}
                    <span>{flow.name}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          {activeFlow?.paused ? <div className="flow-paused-badge">Paused</div> : null}
          <input value={newFlowName} onChange={(event) => setNewFlowName(event.target.value)} placeholder="Flow name" />
          <div className="flow-library-actions">
            <button onClick={() => createFlow(false)} title="Create flow" type="button"><FilePlus size={16} /> New</button>
            <button onClick={() => createFlow(true)} title="Duplicate flow" type="button"><Copy size={16} /> Copy</button>
            <button disabled={!newFlowName.trim()} onClick={renameFlow} title="Rename selected flow" type="button"><Pencil size={16} /> Rename</button>
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
            <button onClick={() => setIsRecipeModalOpen(true)} title="Create a flow from a guided recipe" type="button"><FilePlus size={16} /> Recipes</button>
            <button onClick={() => setIsVoiceSetupModalOpen(true)} title="Set up Home Assistant voice commands" type="button"><Mic size={16} /> Voice Setup</button>
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
              <button className={showLastRunSnapshot ? 'is-active' : ''} onClick={() => setShowLastRunSnapshot((current) => !current)} disabled={!hasLastRunSnapshot} title="Show last run snapshot" type="button"><History size={18} /></button>
              <button onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))} title={`Switch to ${isDarkTheme ? 'light' : 'dark'} mode`} type="button">
                {isDarkTheme ? <Sun size={18} /> : <Moon size={18} />}
              </button>
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
            connectionRadius={18}
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
            <Inspector entities={entities} node={selectedNode} nodeTestResult={nodeTestResult} onTestNode={testSelectedNode} services={services} updateNodeData={updateNodeData} />
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
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search entities" />
          </div>
          <div className="entity-filter-grid">
            <label>
              Area
              <select className="entity-area-select" value={isEntitySearchActive && selectedAreaName === ALL_ENTITY_AREAS ? ALL_ENTITY_AREAS : (visibleEntityArea?.areaName ?? '')} onChange={(event) => setSelectedAreaName(event.target.value)}>
                {isEntitySearchActive ? <option value={ALL_ENTITY_AREAS}>All matching areas</option> : null}
                {groupedEntities.map((areaGroup) => (
                  <option key={areaGroup.areaName} value={areaGroup.areaName}>{areaGroup.areaName}</option>
                ))}
              </select>
            </label>
            <label>
              Type
              <select className="entity-area-select" value={selectedEntityType} onChange={(event) => setSelectedEntityType(event.target.value)}>
                <option value="">All types</option>
                {entityTypeOptions.map((type) => <option key={type} value={type}>{formatDomainName(type)}</option>)}
              </select>
            </label>
            <label>
              State
              <select className="entity-area-select" value={selectedEntityState} onChange={(event) => setSelectedEntityState(event.target.value)}>
                <option value="">All states</option>
                {entityStateOptions.map((state) => <option key={state} value={state}>{formatStateOption(state)}</option>)}
              </select>
            </label>
            <label>
              Use in Flow
              <select className="entity-area-select" value={selectedEntityUsage} onChange={(event) => setSelectedEntityUsage(event.target.value)}>
                <option value="all">All entities</option>
                <option value="used">Only used in this flow</option>
                <option value="unused">Only unused entities</option>
              </select>
            </label>
          </div>
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

      {isRecipeModalOpen ? (
        <div className="log-modal-backdrop" onMouseDown={() => setIsRecipeModalOpen(false)}>
          <section className="log-modal recipe-modal" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <strong>Flow Recipes</strong>
                <span>Create a new editable flow from a description or selected Home Assistant entities.</span>
              </div>
              <div className="log-modal-actions">
                <button onClick={() => setIsRecipeModalOpen(false)} title="Close recipes" type="button"><X size={18} /></button>
              </div>
            </header>
            <div className="recipe-modal-body">
              <section className="automated-recipe">
                <div className="recipe-beta-note">
                  Creating recipes is in Beta. Your feedback is welcome!
                </div>
                <label>
                  Describe The Flow You Want
                  <div className="recipe-description-input">
                    <textarea
                      onChange={(event) => {
                        setRecipeDescription(event.target.value)
                        setRecipeDescriptionResult(null)
                      }}
                      placeholder="If front door is open, turn on the hallway light but only between sunset and sunrise"
                      rows={3}
                      value={recipeDescription}
                    />
                    <button
                      className={recipeVoiceStatus === 'listening' ? 'is-listening' : ''}
                      disabled={!canDictateRecipe || recipeVoiceStatus === 'listening'}
                      onClick={dictateRecipeDescription}
                      title={canDictateRecipe ? 'Dictate recipe description' : 'Speech recognition is not available in this browser'}
                      type="button"
                    >
                      <Mic size={16} />
                      {recipeVoiceStatus === 'listening' ? 'Listening' : 'Dictate'}
                    </button>
                  </div>
                </label>
                {recipeDescriptionResult ? (
                  <div className={`node-test-result ${recipeDescriptionResult.status || 'info'}`}>
                    <strong>{recipeDescriptionResult.title}</strong>
                    {(recipeDescriptionResult.details ?? []).map((detail, index) => <span key={`${detail}-${index}`}>{detail}</span>)}
                  </div>
                ) : null}
                <div className="automated-recipe-actions">
                  <button className="primary-action" disabled={!recipeDescription.trim()} onClick={createAutomatedRecipeFlow} type="button">Create New Flow</button>
                  <button disabled={!recipeDescription.trim() || !nodes.length} onClick={adjustCurrentRecipeFlow} type="button">Adjust Current Flow</button>
                </div>
              </section>
              <div className="recipe-divider">Or choose a ready-made recipe</div>
              <label>
                Recipe
                <select value={selectedRecipe?.id || ''} onChange={(event) => {
                  setSelectedRecipeId(event.target.value)
                  setRecipeValues({})
                }}>
                  {FLOW_RECIPES.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.name}</option>)}
                </select>
              </label>
              <p>{selectedRecipe?.description}</p>
              <div className="recipe-fields">
                {selectedRecipe?.fields.map((field) => (
                  <RecipeField
                    entities={entities}
                    field={field}
                    key={field.id}
                    notifyServiceOptions={notifyServiceOptions}
                    onChange={(value) => setRecipeValues((current) => ({ ...current, [field.id]: value }))}
                    value={recipeValues[field.id] || ''}
                  />
                ))}
              </div>
              <div className="recipe-actions">
                <button onClick={() => setIsRecipeModalOpen(false)} type="button">Cancel</button>
                <button className="primary-action" onClick={createRecipeFlow} type="button">Create Flow</button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {isVoiceSetupModalOpen ? (
        <div className="log-modal-backdrop" onMouseDown={() => setIsVoiceSetupModalOpen(false)}>
          <section className="log-modal voice-setup-modal" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <strong>Voice Setup</strong>
                <span>Connect Home Assistant Assist or voice satellites to HAFlow.</span>
              </div>
              <div className="log-modal-actions">
                <button onClick={() => setIsVoiceSetupModalOpen(false)} title="Close voice setup" type="button"><X size={18} /></button>
              </div>
            </header>
            <div className="voice-setup-body">
              <div className="recipe-beta-note">Creating recipes is in Beta. Your feedback is welcome!</div>
              <label>
                HAFlow URL
                <input value={voiceSetupBaseUrl} onChange={(event) => setVoiceSetupBaseUrl(event.target.value)} placeholder="http://homeassistant.local:4177" />
              </label>
              <div className="voice-setup-actions">
                <button onClick={() => window.open(`${voiceSetupBaseUrl.replace(/\/+$/, '')}/health`, '_blank', 'noopener,noreferrer')} type="button">Open Health Check</button>
                <button onClick={testVoiceSetupApi} type="button">Test Voice API</button>
                <button className="primary-action" onClick={copyVoiceSetupYaml} type="button">Copy YAML</button>
              </div>
              {voiceSetupResult ? (
                <div className={`node-test-result ${voiceSetupResult.status || 'info'}`}>
                  <strong>{voiceSetupResult.title}</strong>
                  {(voiceSetupResult.details ?? []).map((detail, index) => <span key={`${detail}-${index}`}>{detail}</span>)}
                </div>
              ) : null}
              <div className="voice-setup-steps">
                <div><strong>1</strong><span>Paste the YAML into Home Assistant `configuration.yaml`.</span></div>
                <div><strong>2</strong><span>Run Check Configuration, then restart Home Assistant.</span></div>
                <div><strong>3</strong><span>Test Assist with: make a flow when bathroom door closes turn on vanity lights.</span></div>
              </div>
              <label>
                Home Assistant YAML
                <textarea readOnly spellCheck="false" value={voiceSetupYaml} />
              </label>
            </div>
          </section>
        </div>
      ) : null}

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

function RecipeField({ entities, field, notifyServiceOptions, onChange, value }) {
  if (field.type === 'text') {
    return <label>{field.label}<input onChange={(event) => onChange(event.target.value)} placeholder={field.defaultValue || field.label} type="text" value={value ?? ''} /></label>
  }

  if (field.type === 'entity') {
    const options = getRecipeEntityOptions(entities, field)
    return (
      <label>
        {field.label}
        <select onChange={(event) => onChange(event.target.value)} value={value}>
          <option value="">Choose {field.label}</option>
          {options.map((entity) => (
            <option key={entity.entity_id} value={entity.entity_id}>
              {entity.areaName || 'Unassigned'} / {entity.deviceType || formatDomainName(entity.domain)} / {entity.friendlyName || entity.entity_id}
            </option>
          ))}
        </select>
      </label>
    )
  }

  if (field.type === 'notifyService') {
    return (
      <label>
        {field.label}
        <select onChange={(event) => onChange(event.target.value)} value={value}>
          {notifyServiceOptions.map((option) => <option key={option.value || 'default'} value={option.value}>{option.label}</option>)}
        </select>
      </label>
    )
  }

  return (
    <label>
      {field.label}
      <select onChange={(event) => onChange(event.target.value)} value={value}>
        {(field.options ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
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

function EntitySuggestionSelect({ entities, suggestions = [], onSelect }) {
  const options = suggestions
    .map((suggestion) => {
      const entityId = suggestion.entityId || suggestion.entity_id
      const entity = entities.find((item) => item.entity_id === entityId)
      return entityId ? { entityId, entity, suggestion } : null
    })
    .filter(Boolean)

  if (!options.length) return null

  return (
    <label className="entity-suggestion-select">
      Suggested entity
      <select value="" onChange={(event) => event.target.value && onSelect(event.target.value)}>
        <option value="">Choose close match</option>
        {options.map(({ entityId, entity, suggestion }) => (
          <option key={entityId} value={entityId}>
            {entity?.areaName || 'Unassigned'} / {entity?.deviceType || suggestion.domain || 'Entity'} / {entity?.friendlyName || suggestion.name || entityId}
          </option>
        ))}
      </select>
    </label>
  )
}

function SchedulePointEditor({ data, field, label, updateNodeData }) {
  const typeKey = field === 'at' ? 'atType' : `${field}Type`
  const timeKey = field === 'at' ? 'at' : `${field}Time`
  const type = getScheduleTimeType(data, field)
  return (
    <div className="schedule-point">
      <label>
        {label}
        <select value={type} onChange={(event) => updateNodeData({ [typeKey]: event.target.value })}>
          <option value="time">Time</option>
          <option value="sunrise">Sunrise</option>
          <option value="sunset">Sunset</option>
        </select>
      </label>
      {type === 'time' && (
        <label>
          Time
          <input value={data[timeKey] ?? ''} onChange={(event) => updateNodeData({ [timeKey]: event.target.value })} type="time" />
        </label>
      )}
    </div>
  )
}

function Inspector({ entities, node, nodeTestResult, onTestNode, services, updateNodeData }) {
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
  const helperEntities = useMemo(() => entities.filter((entity) => ['input_text', 'input_select'].includes(entity.domain)), [entities])
  const notifyServiceNames = services.notify ? Object.keys(services.notify).sort() : []
  const notifyTarget = data.notifyService || data.target || ''
  const notifyUsesCustomTarget = data.kind === 'notify' && notifyTarget && !notifyServiceNames.includes(notifyTarget)
  const notifyServiceKey = String(notifyTarget || 'notify').replace(/^notify\./, '')
  const notifyIsPushover = data.kind === 'notify' && notifyServiceKey.toLowerCase().includes('pushover')
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
      const patch = { entityIds, ...getActionServicePatch(entityIds, data.service, services) }
      updateNodeData(patch)
      return
    }

    const patch = { entityId }
    if (['state', 'event'].includes(data.kind) && entity && ['on', 'off'].includes(entity.state) && !data.to) patch.to = 'on'
    updateNodeData(patch)
  }
  const applySuggestedEntity = (entityId) => {
    const entity = entities.find((item) => item.entity_id === entityId)
    if (data.kind === 'service') {
      const entityIds = Array.from(new Set([...(data.entityIds ?? []), entityId]))
      updateNodeData({
        entityIds,
        entityId: entityIds[0],
        label: entityIds.length === 1 ? (entity?.friendlyName || entityId) : `${entityIds.length} Actions`,
        entitySuggestions: [],
        ...getActionServicePatch(entityIds, data.service, services),
      })
      return
    }

    if (data.kind === 'state') {
      const rules = getStateTriggerRules(data)
      const nextRules = rules.length
        ? rules.map((rule, index) => index === 0 ? { ...rule, entityId } : rule)
        : [{ id: `${node.id}-suggested-trigger`, entityId, from: data.from ?? '', to: data.to ?? '' }]
      updateNodeData({
        triggers: nextRules,
        entityId,
        label: entity?.friendlyName || data.label,
        entitySuggestions: [],
      })
      return
    }

    if (data.kind === 'condition') {
      const rules = getConditionRules(data)
      const nextRules = rules.length
        ? rules.map((rule, index) => index === 0 ? { ...rule, entityId } : rule)
        : [{ id: `${node.id}-suggested-condition`, entityId, attribute: data.attribute ?? 'state', operator: data.operator ?? 'equals', value: data.value ?? '' }]
      updateNodeData({
        conditions: nextRules,
        entityId,
        label: entity?.friendlyName || data.label,
        entitySuggestions: [],
      })
      return
    }

    updateNodeData({
      entityId,
      label: entity?.friendlyName || data.label,
      entitySuggestions: [],
    })
  }
  const clearEntity = () => {
    if (data.kind === 'event') updateNodeData({ entityId: '', from: '', to: '', label: getCatalogLabel(data.kind) })
    else updateNodeData({ entityId: '', attribute: 'state', to: '', value: '', label: getCatalogLabel(data.kind) })
  }
  const updateScheduleDay = (day, selected) => {
    const currentDays = data.days?.length ? data.days : WEEKDAY_OPTIONS.map((option) => option.value)
    const current = new Set(currentDays.map(Number))
    if (selected) current.add(day)
    else current.delete(day)
    updateNodeData({ days: Array.from(current).sort((first, second) => first - second) })
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
      <button className="secondary-action inspector-test-button" disabled={nodeTestResult?.status === 'loading'} onClick={onTestNode} type="button">
        <SquarePlay size={16} />
        {nodeTestResult?.status === 'loading' ? 'Testing Selected Node' : 'Test Selected Node'}
      </button>
      {nodeTestResult ? (
        <div className={`node-test-result ${nodeTestResult.status || 'info'}`}>
          <strong>{nodeTestResult.title || 'Node test result'}</strong>
          {(nodeTestResult.details ?? []).map((detail, index) => <span key={`${detail}-${index}`}>{detail}</span>)}
        </div>
      ) : null}
      {!data.entityId && !(data.entityIds ?? []).length && (
        <EntitySuggestionSelect entities={entities} onSelect={applySuggestedEntity} suggestions={data.entitySuggestions} />
      )}
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
                    ...getActionServicePatch(entityIds, data.service, services),
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
        <div className="schedule-editor">
          <label>
            Mode
            <select value={data.scheduleMode === 'between' ? 'between' : 'at'} onChange={(event) => updateNodeData({ scheduleMode: event.target.value })}>
              <option value="at">At a time</option>
              <option value="between">Between times</option>
            </select>
          </label>
          {data.scheduleMode === 'between' ? (
            <div className="schedule-range">
              <SchedulePointEditor data={data} field="start" label="Start" updateNodeData={updateNodeData} />
              <SchedulePointEditor data={data} field="end" label="End" updateNodeData={updateNodeData} />
            </div>
          ) : (
            <SchedulePointEditor data={data} field="at" label="At" updateNodeData={updateNodeData} />
          )}
          <div className="weekday-picker" role="group" aria-label="Days of week">
            {WEEKDAY_OPTIONS.map((day) => {
              const selectedDays = data.days ?? []
              const checked = !selectedDays.length || selectedDays.map(Number).includes(day.value)
              return (
                <label key={day.value} className={checked ? 'selected' : ''}>
                  <input checked={checked} onChange={(event) => updateScheduleDay(day.value, event.target.checked)} type="checkbox" />
                  <span>{day.label}</span>
                </label>
              )
            })}
          </div>
        </div>
      )}
      {data.kind === 'direction' && (
        <div className="direction-editor">
          <div className="field-grid">
            <label>
              Entity A
              <EntityInput entities={entities} onChange={(entityA) => updateNodeData({ entityA })} placeholder="Select first entity" value={data.entityA} />
            </label>
            <label>
              Entity B
              <EntityInput entities={entities} onChange={(entityB) => updateNodeData({ entityB })} placeholder="Select second entity" value={data.entityB} />
            </label>
          </div>
          <label>
            Active states
            <input value={data.activeStates ?? DIRECTION_ACTIVE_STATES} onChange={(event) => updateNodeData({ activeStates: event.target.value })} />
          </label>
          <div className="field-grid">
            <label>
              A then B
              <input value={data.directionAB ?? 'in'} onChange={(event) => updateNodeData({ directionAB: event.target.value })} />
            </label>
            <label>
              B then A
              <input value={data.directionBA ?? 'out'} onChange={(event) => updateNodeData({ directionBA: event.target.value })} />
            </label>
          </div>
          <label>
            Save to helper
            <EntityInput entities={helperEntities} onChange={(targetEntityId) => updateNodeData({ targetEntityId })} placeholder="Select input_text or input_select" value={data.targetEntityId} />
          </label>
        </div>
      )}
      {data.kind === 'condition' && (
        <ConditionRulesEditor data={data} entities={entities} updateNodeData={updateNodeData} />
      )}
      {data.kind === 'and' && (
        <label>
          Active states
          <input value={data.activeStates ?? DIRECTION_ACTIVE_STATES} onChange={(event) => updateNodeData({ activeStates: event.target.value })} />
        </label>
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
          <ServicePayloadBuilder
            entities={selectedActionEntities}
            payload={data.payload}
            service={data.service}
            updateNodeData={updateNodeData}
          />
          <SharedAttributes attributes={sharedAttributes} payload={data.payload} updateNodeData={updateNodeData} />
          <label>JSON payload<textarea value={data.payload ?? '{}'} onChange={(event) => updateNodeData({ payload: event.target.value })} spellCheck="false" /></label>
        </>
      )}
      {data.kind === 'notify' && (
        <>
          <label>
            Service
            <select
              value={notifyUsesCustomTarget ? '__custom__' : notifyTarget}
              onChange={(event) => {
                if (event.target.value === '__custom__') updateNodeData({ notifyService: '', target: notifyTarget })
                else updateNodeData({ notifyService: event.target.value, target: event.target.value })
              }}
            >
              <option value="">notify.notify</option>
              {notifyServiceNames.map((name) => <option key={name} value={name}>notify.{name}</option>)}
              <option value="__custom__">Custom service</option>
            </select>
          </label>
          {notifyUsesCustomTarget && (
            <label>Custom service<input value={data.target ?? ''} onChange={(event) => updateNodeData({ target: event.target.value, notifyService: '' })} placeholder="notify.pushover" /></label>
          )}
          <label>Message<input value={data.message ?? ''} onChange={(event) => updateNodeData({ message: event.target.value })} placeholder="Driveway motion: {direction}" /></label>
          <p className="field-note">Use {'{direction}'} to include the latest Direction node result.</p>
          <label>Title<input value={data.title ?? ''} onChange={(event) => updateNodeData({ title: event.target.value })} placeholder="Optional" /></label>
          <div className="notify-action-options">
            <span className="field-label">Action buttons</span>
            <p className="field-note">Requires the Home Assistant Companion App on the receiving Android or Apple device.</p>
            <p className="field-note">Add up to three buttons. HAFlow safely correlates action events to this flow run. For links, use action ID URI; link buttons open directly and do not resume a branch.</p>
            {[0, 1, 2].map((index) => {
              const action = data.notifyActions?.[index] ?? {}
              const updateAction = (patch) => {
                const notifyActions = Array.from({ length: 3 }, (_, actionIndex) => ({ ...(data.notifyActions?.[actionIndex] ?? {}) }))
                notifyActions[index] = { ...notifyActions[index], ...patch }
                updateNodeData({ notifyActions })
              }
              return (
                <div className="notify-action-row" key={index}>
                  <span>Button {index + 1}</span>
                  <input value={action.title ?? ''} onChange={(event) => updateAction({ title: event.target.value })} placeholder="Label (for example, Close)" />
                  <input value={action.action ?? ''} onChange={(event) => updateAction({ action: event.target.value })} placeholder="Optional action ID (generated from label)" />
                  <input value={action.uri ?? ''} onChange={(event) => updateAction({ uri: event.target.value })} placeholder="Optional URI or dashboard path" />
                </div>
              )
            })}
            <div className="field-grid">
              <label>Response timeout (seconds)<input min="1" value={data.notifyTimeoutSeconds ?? 60} onChange={(event) => updateNodeData({ notifyTimeoutSeconds: Number(event.target.value) })} type="number" /></label>
              <label>Number of resends<input min="0" step="1" value={data.notifyResendCount ?? 0} onChange={(event) => updateNodeData({ notifyResendCount: Number(event.target.value) })} type="number" /></label>
            </div>
            <p className="field-note">Resends are additional attempts after the first send. After the last response timeout, the flow follows the Timeout output.</p>
          </div>
          {notifyIsPushover && (
            <div className="notify-service-options">
              <div className="field-grid">
                <label>
                  Pushover priority
                  <select value={data.pushoverPriority ?? ''} onChange={(event) => updateNodeData({ pushoverPriority: event.target.value })}>
                    {PUSHOVER_PRIORITIES.map((priority) => <option key={`${priority.value}-${priority.label}`} value={priority.value}>{priority.label}</option>)}
                  </select>
                </label>
                <label>
                  Pushover sound
                  <select value={data.pushoverSound ?? ''} onChange={(event) => updateNodeData({ pushoverSound: event.target.value })}>
                    {PUSHOVER_SOUNDS.map((sound) => <option key={sound || 'default'} value={sound}>{sound || 'Default'}</option>)}
                  </select>
                </label>
              </div>
            </div>
          )}
          <label>Data JSON<textarea value={data.dataJson ?? '{}'} onChange={(event) => updateNodeData({ dataJson: event.target.value })} placeholder='{"priority": 0, "sound": "pushover"}' spellCheck="false" /></label>
        </>
      )}
      {data.kind === 'debug' && (
        <label>Message<input value={data.message ?? ''} onChange={(event) => updateNodeData({ message: event.target.value })} /></label>
      )}
      {data.kind === 'comment' && (
        <label>Comment<textarea value={data.text ?? ''} onChange={(event) => updateNodeData({ text: event.target.value })} placeholder="Describe why this part of the flow exists." /></label>
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

function getActionServicePatch(entityIds, currentService, services = {}) {
  const domains = Array.from(new Set(entityIds.map((id) => String(id).split('.')[0]).filter(Boolean)))
  if (!domains.length) return {}

  if (domains.length > 1) {
    const canKeepOnOff = ON_OFF_SERVICES.has(currentService) && domains.every((domain) => serviceExists(services, domain, currentService))
    const service = canKeepOnOff
      ? currentService
      : domains.every((domain) => serviceExists(services, domain, 'turn_on')) ? 'turn_on' : currentService
    return { domain: domains[0], service }
  }

  const domain = domains[0]
  const domainServices = services[domain] ? Object.keys(services[domain]) : []
  return {
    domain,
    service: getDefaultService(domainServices, currentService),
  }
}

function serviceExists(services, domain, service) {
  return !services[domain] || Boolean(services[domain][service])
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
      operator: selectedRules[0]?.operator ?? '',
      value: selectedRules[0]?.value ?? '',
      duration: selectedRules[0]?.duration ?? '',
      durationUnit: selectedRules[0]?.durationUnit ?? 'minutes',
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
      operator: '',
      value: '',
      duration: '',
      durationUnit: 'minutes',
    }))
  }

  const removeRule = (index) => {
    if (editableRules.length === 1) {
      commitRules([{
        id: editableRules[index]?.id ?? emptyRuleId.current,
        entityId: '',
        from: '',
        to: '',
        operator: '',
        value: '',
        duration: '',
        durationUnit: 'minutes',
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
        const numeric = isNumericEntity(entity)

        return (
          <div className="condition-rule" key={rule.id ?? `${rule.entityId}-${index}`}>
            <label className="condition-rule-entity">
              Entity (choose from list or search and select from Entities below)
              <EntityInput entities={entities} onChange={(entityId) => updateRule(index, { entityId, deviceId: '', from: '', to: '', operator: '', value: '', duration: '', durationUnit: 'minutes' })} placeholder="Select entity" value={isSelectableEntity(entity) ? rule.entityId : ''} />
            </label>
            <SelectedEntityChip
              entity={entity}
              entityId={rule.entityId}
              onRemove={() => updateRule(index, { entityId: '', deviceId: '', from: '', to: '', operator: '', value: '', duration: '', durationUnit: 'minutes' })}
            />
            <div className="trigger-rule-values">
              {numeric ? (
                <>
                  <label>
                    Comparison
                    <select value={rule.operator || 'equals'} onChange={(event) => updateRule(index, { operator: event.target.value, from: '', to: '' })}>
                      <option value="equals">Equal to</option>
                      <option value="not_equals">Not equal to</option>
                      <option value="greater_than">Greater than</option>
                      <option value="greater_than_or_equal">Greater than or equal to</option>
                      <option value="less_than">Less than</option>
                      <option value="less_than_or_equal">Less than or equal to</option>
                    </select>
                  </label>
                  <label>Value<input type="number" value={rule.value ?? ''} onChange={(event) => updateRule(index, { operator: rule.operator || 'equals', value: event.target.value })} placeholder="Enter number" /></label>
                  <label className="trigger-duration-field">
                    For (optional)
                    <span className="duration-inputs">
                      <input min="0" step="any" type="number" value={rule.duration ?? ''} onChange={(event) => updateRule(index, { operator: rule.operator || 'equals', duration: event.target.value })} placeholder="Duration" />
                      <select value={rule.durationUnit ?? 'minutes'} onChange={(event) => updateRule(index, { durationUnit: event.target.value })}>
                        <option value="seconds">seconds</option>
                        <option value="minutes">minutes</option>
                        <option value="hours">hours</option>
                      </select>
                    </span>
                  </label>
                </>
              ) : (
                <>
                  <label>From<StateValueSelect entity={entity} onChange={(from) => updateRule(index, { from, operator: '', value: '' })} options={stateOptions} placeholder="optional" value={rule.from} /></label>
                  <label>To<StateValueSelect entity={entity} onChange={(to) => updateRule(index, { to, operator: '', value: '' })} options={stateOptions} placeholder="optional" value={rule.to} /></label>
                </>
              )}
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
        nextRule.operator = 'equals'
        nextRule.value = ''
      }
      if ('attribute' in patch) {
        nextRule.operator = 'equals'
        nextRule.value = ''
      }
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
        const numeric = isNumericConditionTarget(entity, rule.attribute)

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
                  {numeric ? (
                    <>
                      <option value="greater_than">greater than</option>
                      <option value="greater_than_or_equal">greater than or equal to</option>
                      <option value="less_than">less than</option>
                      <option value="less_than_or_equal">less than or equal to</option>
                    </>
                  ) : <option value="contains">contains</option>}
                </select>
              </label>
              <label>
                Value
                {numeric
                  ? <input type="number" value={rule.value ?? ''} onChange={(event) => updateRule(index, { value: event.target.value })} placeholder="Enter number" />
                  : <ValueSelect entity={(rule.attribute ?? 'state') === 'state' ? entity : undefined} onChange={(value) => updateRule(index, { value })} options={valueOptions} placeholder="Select value" value={rule.value} />}
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

function ServicePayloadBuilder({ entities, payload, service, updateNodeData }) {
  const payloadObject = parsePayloadObject(payload)
  const fields = getServicePayloadFields(entities, service)
  const updatePayload = (key, value, parser = parseAttributeValue, exclusiveWith = []) => {
    const nextPayload = { ...payloadObject }
    exclusiveWith.forEach((exclusiveKey) => delete nextPayload[exclusiveKey])
    nextPayload[key] = parser(value)
    updateNodeData({ payload: JSON.stringify(nextPayload, null, 2) })
  }

  if (!fields.length) return null

  return (
    <div className="shared-attributes service-payload-builder">
      <div className="mini-heading">Service payload builder</div>
      <div className="service-payload-grid">
        {fields.map((field) => (
          <label key={field.key}>
            {field.label}
            {field.type === 'color' ? (
              <ColorValueInput
                attribute={{ key: field.key, sample: field.sample }}
                onChange={(value) => updatePayload(field.key, value, (nextValue) => nextValue)}
                value={payloadObject[field.key]}
              />
            ) : field.options?.length ? (
              <select value={formatAttributeInput(payloadObject[field.key] ?? '')} onChange={(event) => updatePayload(field.key, event.target.value, field.parser, field.exclusiveWith)}>
                <option value="">Choose {field.label}</option>
                {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            ) : (
              <input
                max={field.max}
                min={field.min}
                onChange={(event) => updatePayload(field.key, event.target.value, field.parser, field.exclusiveWith)}
                placeholder={field.placeholder}
                type={field.inputType || 'text'}
                value={formatAttributeInput(payloadObject[field.key] ?? '')}
              />
            )}
          </label>
        ))}
      </div>
    </div>
  )
}

function getServicePayloadFields(entities, service) {
  const domains = Array.from(new Set(entities.map((entity) => entity.domain || String(entity.entity_id).split('.')[0]).filter(Boolean)))
  const fields = []
  const hasDomain = (domain) => domains.includes(domain)
  const addField = (field) => {
    if (!fields.some((item) => item.key === field.key)) fields.push(field)
  }

  if (hasDomain('light') && service === 'turn_on') {
    addField({ key: 'brightness_pct', label: 'Brightness', options: percentOptions([1, 5, 10, 25, 50, 75, 100]), exclusiveWith: ['brightness_step_pct'] })
    addField({
      key: 'brightness_step_pct',
      label: 'Brightness Step',
      options: [
        { value: '-5', label: 'Dim 5%' },
        { value: '5', label: 'Brighten 5%' },
      ],
      parser: parseNumberPayload,
      exclusiveWith: ['brightness_pct'],
    })
    addField({ key: 'transition', label: 'Transition Time', options: durationOptions() })
    addField({ key: 'color_temp_kelvin', label: 'Color Temperature', options: kelvinOptions(entities) })
    addField({ key: 'rgb_color', label: 'Color', type: 'color', sample: [255, 255, 255] })
    const effectOptions = intersectArrayAttributeOptions(entities.filter((entity) => entity.domain === 'light'), 'effect_list')
    if (effectOptions.length) addField({ key: 'effect', label: 'Effect', options: effectOptions })
  }

  if (hasDomain('fan') && service === 'turn_on') {
    addField({ key: 'percentage', label: 'Fan Speed', options: percentOptions([10, 25, 50, 75, 100]) })
    const presetOptions = intersectArrayAttributeOptions(entities.filter((entity) => entity.domain === 'fan'), 'preset_modes')
    if (presetOptions.length) addField({ key: 'preset_mode', label: 'Preset Mode', options: presetOptions })
  }

  if (hasDomain('cover') && service === 'set_cover_position') {
    addField({ key: 'position', label: 'Cover Position', options: percentOptions([0, 10, 25, 50, 75, 90, 100]) })
  }

  if (hasDomain('climate') && ['set_hvac_mode', 'set_temperature'].includes(service)) {
    const hvacOptions = intersectArrayAttributeOptions(entities.filter((entity) => entity.domain === 'climate'), 'hvac_modes')
    if (hvacOptions.length) addField({ key: 'hvac_mode', label: 'HVAC Mode', options: hvacOptions })
    addField({ key: 'temperature', label: 'Temperature', inputType: 'number', parser: parseNumberPayload, placeholder: '72' })
  }

  if (hasDomain('input_number') && service === 'set_value') {
    addField({ key: 'value', label: 'Value', inputType: 'number', parser: parseNumberPayload, placeholder: inputNumberPlaceholder(entities) })
  }

  if (hasDomain('input_select') && service === 'select_option') {
    const optionChoices = intersectArrayAttributeOptions(entities.filter((entity) => entity.domain === 'input_select'), 'options')
    addField({ key: 'option', label: 'Option', options: optionChoices })
  }

  if (hasDomain('media_player') && ['volume_set', 'play_media'].includes(service)) {
    if (service === 'volume_set') addField({ key: 'volume_level', label: 'Volume', options: percentOptions([0, 10, 25, 50, 75, 100], (value) => value / 100) })
    if (service === 'play_media') {
      addField({ key: 'media_content_type', label: 'Media Type', options: [
        { value: 'music', label: 'Music' },
        { value: 'playlist', label: 'Playlist' },
        { value: 'video', label: 'Video' },
        { value: 'channel', label: 'Channel' },
        { value: 'url', label: 'URL' },
      ] })
      addField({ key: 'media_content_id', label: 'Media Content ID', placeholder: 'Media URL or content ID' })
    }
  }

  return fields
}

function percentOptions(values, transform = (value) => value) {
  return values.map((value) => ({ value: String(transform(value)), label: `${value}%` }))
}

function durationOptions() {
  return [
    { value: '0', label: 'Instant' },
    { value: '1', label: '1 second' },
    { value: '3', label: '3 seconds' },
    { value: '5', label: '5 seconds' },
    { value: '10', label: '10 seconds' },
    { value: '30', label: '30 seconds' },
  ]
}

function kelvinOptions(entities) {
  const lights = entities.filter((entity) => entity.domain === 'light')
  const mins = lights.map((entity) => Number(entity.attributes?.min_color_temp_kelvin)).filter(Boolean)
  const maxes = lights.map((entity) => Number(entity.attributes?.max_color_temp_kelvin)).filter(Boolean)
  const min = mins.length ? Math.max(...mins) : 2000
  const max = maxes.length ? Math.min(...maxes) : 6500
  return [
    { value: '2200', label: 'Warm candlelight' },
    { value: '2700', label: 'Warm white' },
    { value: '3500', label: 'Soft white' },
    { value: '4500', label: 'Cool white' },
    { value: '6500', label: 'Daylight' },
  ].filter((option) => Number(option.value) >= min && Number(option.value) <= max)
}

function inputNumberPlaceholder(entities) {
  const mins = entities.map((entity) => Number(entity.attributes?.min)).filter(Number.isFinite)
  const maxes = entities.map((entity) => Number(entity.attributes?.max)).filter(Number.isFinite)
  if (mins.length && maxes.length) return `${Math.max(...mins)}-${Math.min(...maxes)}`
  return 'Number'
}

function parseNumberPayload(value) {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : value
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
