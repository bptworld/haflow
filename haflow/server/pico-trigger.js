export const LUTRON_PICO_EVENT = 'lutron_caseta_button_event'
export const LUTRON_PICO_PLATFORM = 'lutron_caseta_pico'

export function getIdentifierValues(identifiers = []) {
  return identifiers
    .filter((identifier) => Array.isArray(identifier) && identifier.length >= 2)
    .map((identifier) => String(identifier[1]))
}

export function isLutronPicoTrigger(rule = {}) {
  if (rule.triggerPlatform === LUTRON_PICO_PLATFORM) return true
  return (rule.deviceIdentifiers ?? []).some((identifier) => (
    Array.isArray(identifier) && identifier[0] === 'lutron_caseta'
  )) && hasButtonNumber(rule.buttonNumber)
}

export function matchesLutronPicoPress(rule, event, registryIdentifiers = []) {
  const identifiers = [...(rule.deviceIdentifiers ?? []), ...registryIdentifiers]
  if (!isLutronPicoTrigger({ ...rule, deviceIdentifiers: identifiers }) || event?.event_type !== LUTRON_PICO_EVENT) return false

  const data = event.data ?? {}
  if (data.action !== 'press') return false
  if (!sameButton(data.button_number, rule.buttonNumber)) return false

  const eventDeviceId = data.device_id ?? data.deviceId ?? data.device?.id
  const deviceMatches = Boolean(eventDeviceId && rule.deviceId && String(eventDeviceId) === String(rule.deviceId))
  const eventSerial = data.serial ?? data.device_serial ?? data.serial_number
  const knownSerials = getIdentifierValues(identifiers)
  const serialMatches = Boolean(eventSerial !== undefined && knownSerials.includes(String(eventSerial)))

  return deviceMatches || serialMatches
}

function hasButtonNumber(value) {
  return value !== undefined && value !== null && value !== ''
}

function sameButton(actual, expected) {
  if (!hasButtonNumber(actual) || !hasButtonNumber(expected)) return false
  return String(actual) === String(expected)
}
