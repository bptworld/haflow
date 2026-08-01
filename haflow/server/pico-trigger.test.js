import test from 'node:test'
import assert from 'node:assert/strict'
import { LUTRON_PICO_PLATFORM, isLutronPicoTrigger, matchesLutronPicoPress } from './pico-trigger.js'

const rule = {
  triggerPlatform: LUTRON_PICO_PLATFORM,
  deviceId: 'device-123',
  deviceIdentifiers: [['lutron_caseta', 41843209]],
  buttonNumber: 5,
}

test('matches a Pico press by saved serial', () => {
  assert.equal(matchesLutronPicoPress(rule, {
    event_type: 'lutron_caseta_button_event',
    data: { serial: 41843209, button_number: 5, action: 'press' },
  }), true)
})

test('matches a Pico press by Home Assistant device id', () => {
  assert.equal(matchesLutronPicoPress(rule, {
    event_type: 'lutron_caseta_button_event',
    data: { device_id: 'device-123', button_number: 5, action: 'press' },
  }), true)
})

test('can recover the serial from the current device registry', () => {
  const ruleWithoutSavedIdentifiers = { deviceId: 'device-123', buttonNumber: 5 }
  assert.equal(matchesLutronPicoPress(ruleWithoutSavedIdentifiers, {
    event_type: 'lutron_caseta_button_event',
    data: { serial: 41843209, button_number: 5, action: 'press' },
  }, [['lutron_caseta', 41843209]]), true)
})

test('rejects releases, other buttons, devices, and event types', () => {
  const base = { serial: 41843209, button_number: 5, action: 'press' }
  assert.equal(matchesLutronPicoPress(rule, { event_type: 'lutron_caseta_button_event', data: { ...base, action: 'release' } }), false)
  assert.equal(matchesLutronPicoPress(rule, { event_type: 'lutron_caseta_button_event', data: { ...base, button_number: 3 } }), false)
  assert.equal(matchesLutronPicoPress(rule, { event_type: 'lutron_caseta_button_event', data: { ...base, serial: 999 } }), false)
  assert.equal(matchesLutronPicoPress(rule, { event_type: 'state_changed', data: base }), false)
})

test('recognizes legacy saved Lutron Pico rules', () => {
  assert.equal(isLutronPicoTrigger({ deviceIdentifiers: [['lutron_caseta', '123']], buttonNumber: 1 }), true)
  assert.equal(isLutronPicoTrigger({ deviceIdentifiers: [['other', '123']], buttonNumber: 1 }), false)
})
