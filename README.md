# Docker Container to Control and Get Statistics On TP-Link HS100 & HS110 Devices via MQTT

## Topics

	hs100/maintenance/_bridge    /online -> bool
	hs100/maintenance/<DEVICE_ID>/online -> bool

    hs100/info/<DEVICE_ID> -> full and detailed device info

	hs100/status/<DEVICE_ID>    -> JSON: {"val":false,"power":0,"voltage":230.68353,"current":0.012407}
	hs100/set   /<DEVICE_ID>    <- bool

(Spaces here are only for formatting, the actual topics won't have them.)

`info` contains the raw JSON data from `tplink-smarthome-api` and `device` contains the device data.

## Configuration

Copy the `docker-compose.yml.sample` to `docker-compose.yml` and modify it so that it suites your needs. The environment variables probably have to be changed:

* `HS100TOMQTT_MQTT_URL` The URL for your MQTT server connection (credentials are not supported)
* `HS100TOMQTT_NAME` The name and prefix for the MQTT topics, prefix can also contain a slash, e.g. `tplink/hs110`
* `HS100TOMQTT_POLLING_INTERVAL` The polling interval in seconds
* `HS100TOMQTT_VERBOSITY` Output verbosity - one of `error`, `warn`, `info`, `debug`

## Usage

The original project over at https://github.com/dersimn/HS100toMQTT supports running the Docker container directly, however this project only officially supports `docker-compose` with building the
container yourself - therefore it also runs on a Raspberry Pi without any issues.

	git clone <this repo URL> HS100toMQTT
	cd HS100toMQTT
    docker-compose up --build -d

### Blocking internet access for your devices

Even though there are currently [no known security issues](https://www.softscheck.com/en/reverse-engineering-tp-link-hs110/) for the HS100 / HS110, if you choose to block internet access for your
plugs, be aware that the unterlying [tplink-smarthome-api](https://github.com/plasticrake/tplink-smarthome-api) will throw an error on every polling cycle, because the TP-Link devices will have a
wrong time set-up (quite obvious: no Internet, no NTP server, no correct set time and date).

I've written this [workaround](https://github.com/dersimn/HS100toMQTT/blob/64a364f0336af1cb08791b13346441641fecee26/index.js#L87) until I found a better way to solve this problem: According
to [this](https://blog.georgovassilis.com/2016/05/07/controlling-the-tp-link-hs100-wi-fi-smart-plug/) source, the plugs are using `fr.pool.ntp.org` to get their time. If you are able to alter the DNS
resolving mechanism of your router (for e.g. when you're using OpenWRT), just make sure to redirect the DNS name to your router IP and setup a local NTP server.

In OpenWRT you can configure this with:

`/etc/config/firewall`:

	config rule
		option enabled '1'
		option src 'lan'
		option name 'Block HS110'
		option src_mac '00:00:00:00:00:00'
		option dest 'wan'
		option target 'REJECT'

`/etc/config/dhcp`:

	config domain
		option name 'fr.pool.ntp.org'
		option ip '10.1.1.1'

## Development

For development you can simply modify `Dockerfile` and enable the `ENTRYPOINT` and comment out `CMD`, then you can simply
`docker exec -it hs100tomqtt bash` and start the script without rebuilds using `node index.js`. Don't forget to change this back before deployment, otherwise your script won't run.

## Credits

* This project is a more or less heavily modified and improved fork of https://github.com/dersimn/HS100toMQTT.
* This project follows [Oliver "owagner" Wagner](https://github.com/owagner)'s architectural proposal for an [mqtt-smarthome](https://github.com/mqtt-smarthome/mqtt-smarthome).
* Built by copy-pasting together [Sebastian "hobbyquaker" Raff](https://github.com/hobbyquaker)'s mqtt-smarthome scripts
  and [Patrick "plasticrake" Seal](https://github.com/plasticrake)'s [tplink-smarthome-api](https://github.com/plasticrake/tplink-smarthome-api).
