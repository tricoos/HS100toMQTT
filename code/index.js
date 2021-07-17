#!/usr/bin/env node

const MqttSmarthome = require("mqtt-smarthome-connect");
const Hs100Api      = require('tplink-smarthome-api');
const log           = require('yalm');
const shortid       = require('shortid');
const fs            = require('fs');

const pkg    = require('./package.json');
const config = require('yargs')
    .env('HS100TOMQTT')
    .usage(pkg.name + ' ' + pkg.version + '\n' + pkg.description + '\n\nUsage: $0 [options]')
    .describe('name', 'instance name. used as mqtt client id and as prefix for connected topic')
    .describe('mqtt-url', 'mqtt broker url. See https://github.com/mqttjs/MQTT.js#connect-using-a-url')
    .describe('polling-interval', 'polling interval (in s) for status updates')
    .describe('devices', 'list of device IPs as String, multiple IPs separated by space')
    .alias(
        {
            h: 'help',
            m: 'mqtt-url',
        }
    )
    .default(
        {
            name              : 'hs100',
            'mqtt-url'        : 'mqtt://127.0.0.1',
            'polling-interval': 10,
            'verbosity'       : 'info'
        }
    )
    .version()
    .help('help')
    .argv;

/**
 * @param deviceId
 * @returns {null|*}
 */
function getDeviceConfig(deviceId) {
    if (typeof deviceConfig[deviceId] !== 'undefined') {
        return deviceConfig[deviceId];
    }

    return null;
}

/**
 * @param deviceId
 * @returns {*}
 */
function getDeviceName(deviceId) {
    const cfg = getDeviceConfig(deviceId);
    if (cfg && typeof cfg.name !== 'undefined') {
        return cfg.name;
    }
    return deviceId;
}

/**
 * @param device
 */
function getHandleDeviceInfo(device) {
    device.getInfo().then(info => {

        let message     = {};
        message.val     = info.sysInfo.relay_state === 1;
        message.power   = info.emeter.realtime.power; // Current also returns values when it is off but no power will be reported then
        message.voltage = info.emeter.realtime.voltage;
        message.current = info.emeter.realtime.current;
        message.energy  = info.emeter.realtime.energy;

        // Publish up-to-date device info - raw JSON from tplink-smarthome-api plus device info
        info.host = device.host;
        mqtt.publish(config.name + "/info/" + getDeviceName(device.deviceId), info); //{'info': info, 'device': device});

        mqtt.publish(config.name + "/status/" + getDeviceName(device.deviceId), message);
    }).catch((err) => {
        log.error(err);
    });
}

// Read optional device config for human-readable names instead of the device ids
let deviceConfig = {};
if (fs.existsSync(__dirname + '/devices.json')) {
    deviceConfig = require(__dirname + '/devices.json');
}

const devices = [];
log.setLevel(config.verbosity);
log.info(pkg.name + ' ' + pkg.version + ' starting');
log.debug("loaded config: ", config);

if (typeof config.devices === 'string') {
    config.devices.split(" ").forEach((ip) => {
        devices.push({"host": ip, "port": 9999});
    });
}

const deviceTimers      = {};
const pollingIntervalMs = config.pollingInterval * 1000;

/***********************/
/*** CONNECT TO MQTT ***/
/***********************/
log.info('mqtt trying to connect', config.mqttUrl);
const mqtt = new MqttSmarthome(config.mqttUrl, {
    logger  : log,
    clientId: config.name.replace('/', '_') + '_' + +shortid.generate(),
    will    : {topic: config.name + '/maintenance/_bridge/online', payload: 'false', retain: true}
});
mqtt.connect();

/**********************/
/*** MQTT CONNECTED ***/
/**********************/
mqtt.on('connect', () => {
    log.info('mqtt connected', config.mqttUrl);
    mqtt.publish(config.name + '/maintenance/_bridge/online', true, {retain: true});
});

const client = new Hs100Api.Client({logLevel: config.verbosity, logger: log});

/************************/
/*** NEW DEVICE FOUND ***/
/************************/
client.on('device-new', (device) => {
    log.info('hs100 device-new', device.model, device.host, device.deviceId, device.name);
    mqtt.publish(config.name + "/maintenance/" + getDeviceName(device.deviceId) + "/online", true);
    mqtt.subscribe(config.name + "/set/" + getDeviceName(device.deviceId), (topic, message, packet) => {
        if (typeof message === 'object') {
            if ('val' in message) {
                if (typeof message.val === 'boolean') {
                    device.setPowerState(message.val);
                }
            }
        }
        if (typeof message === 'boolean') {
            device.setPowerState(message);
        }

        // Execute timer function
        if (deviceTimers[device.deviceId]) {
            deviceTimers[device.deviceId].fn();
        }
    });

    // ...and then in the defined interval
    if (deviceTimers[device.deviceId]) {
        clearInterval(deviceTimers[device.deviceId].timer);
    }
    deviceTimers[device.deviceId] = {
        fn   : function () {
            log.debug('----------------------------------------------------------', device.deviceId);
            getHandleDeviceInfo(device)
        },
        timer: null
    };
    deviceTimers[device.deviceId].timer = setInterval(deviceTimers[device.deviceId].fn, pollingIntervalMs);
});

/************************/
/*** DEVICE IS ONLINE ***/
/************************/
client.on('device-online', (device) => {
    log.debug('hs100 device-online callback', device.name);
    mqtt.publish(config.name + "/maintenance/" + getDeviceName(device.deviceId) + "/online", true);
    if (deviceTimers[device.deviceId]) {
        if (deviceTimers[device.deviceId].timer) {
            clearInterval(deviceTimers[device.deviceId].timer);
        }
        deviceTimers[device.deviceId].timer = setInterval(deviceTimers[device.deviceId].fn, pollingIntervalMs);
    }
});

/*************************/
/*** DEVICE IS OFFLINE ***/
/*************************/
client.on('device-offline', (device) => {
    log.warn('hs100 device-offline callback', device.name);
    mqtt.publish(config.name + "/maintenance/" + getDeviceName(device.deviceId) + "/online", false);
    if (deviceTimers[device.deviceId] && deviceTimers[device.deviceId].timer) {
        clearInterval(deviceTimers[device.deviceId].timer);
    }
});

// Start discovery
log.info('Starting Device Discovery');
client.startDiscovery(
    {
        devices: devices
    }
);
