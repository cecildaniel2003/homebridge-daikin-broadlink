var Service, Characteristic;
var BroadlinkJS = require('broadlinkjs-rm');
var broadlink = new BroadlinkJS()
var mqtt = require('mqtt');

var aircons = {}

const discoveredDevices = {};

broadlink.on('deviceReady', (device) => {
  const macAddressParts = device.mac.toString('hex').match(/[\s\S]{1,2}/g) || []
  const macAddress = macAddressParts.join(':')
  device.host.macAddress = macAddress

  if (discoveredDevices[device.host.address] || discoveredDevices[device.host.macAddress]) return;

  console.log(`Discovered Broadlink RM device at ${device.host.macAddress} (${device.host.address})`)

  discoveredDevices[device.host.address] = device;
  discoveredDevices[device.host.macAddress] = device;
  
  console.log(device.host)
})


// MQTT Setup
var options = {
  port: 1883,
  host: 'iot.eclipse.org',
  clientId: 'Livingroom_AC_MQTT_v2'
};
// var client = mqtt.connect(options);







function daikinAircon(log, config, api) {

  this.name = config.name;
  this.manufacturer = config.manufacturer || 'HTTP Manufacturer';
  this.model = config.model || 'homebridge-thermostat';
  this.serial = config.serial || 'HTTP Serial Number';

  this.temperatureDisplayUnits = config.temperatureDisplayUnits || 0;
  this.maxTemp = config.maxTemp || 30;
  this.minTemp = config.minTemp || 18;
  this.targetRelativeHumidity = 0;
  this.currentRelativeHumidity = 0;
  this.targetTemperature = 22;
  this.currentTemperature = 30;
  this.targetHeatingCoolingState = Characteristic.TargetHeatingCoolingState.OFF;
  this.currentHeatingCoolingState = Characteristic.TargetHeatingCoolingState.OFF; 
  this.power = false;
  this.fanspeed = 3;
  
  this.mqttclient = mqtt.connect(options);
  this.mqtttopic = "jussi.sg/home/temperature/" + config.tempmac
  console.log("subscribe to " + this.mqtttopic)
  this.mqttclient.subscribe(this.mqtttopic);
  aircons[this.mqtttopic] = this
  this.mqttclient.on('message', function(topic, message) {
	  console.log(topic)
	  that = aircons[topic]
	  data = JSON.parse(message);
	  if (data === null) {return null}
	  console.log(data)
	  if(data.temp>0){
	  	that.currentTemperature = data.temp;
	  	that.service.getCharacteristic(Characteristic.CurrentTemperature).setValue(data.temp, undefined, 'fromSetValue');
	  	console.log("setting current temperature to " +  data.temp)
// 	  	this.setTemperature(data.temp, null)
	  }
	  if(data.humidity>0){
	  	that.currentRelativeHumidity = data.humidity;
	  	that.service.getCharacteristic(Characteristic.CurrentRelativeHumidity).setValue(data.humidity, undefined, 'fromSetValue');
	  	console.log("setting current humidity to " +  data.humidity)
// 	  	this.setHumidity(data.humidity, null)
	  }
  });

  
  this.commands = require("./1101.json");

  this.service = new Service.Thermostat(this.name);
  this.fanservice = new Service.Fan(this.name);
  
  this.service.addLinkedService(this.fanservice)
  this.address = config.ip
  address = config.ip
  broadlink.addDevice({address, port: 80 }, config.mac, 0x2737);
  
//   this.broadlinkdevice = discoveredDevices[config.ip];
  
   this.service.getCharacteristic(Characteristic.TargetHeatingCoolingState).setProps(
   		{validValues: [Characteristic.TargetHeatingCoolingState.OFF, 
	   				   Characteristic.TargetHeatingCoolingState.AUTO,
	   				   Characteristic.TargetHeatingCoolingState.COOL]})
  
  this.fanservice.addCharacteristic(Characteristic.RotationSpeed)
	.setProps({
	    minValue: 0,
	    maxValue: 6,
	    minStep: 1
	})

  
	this.fanspeeds = {
		1 : "night",
		2 : "low",
		3 : "lowMedium",
		4 : "medium",
		5 : "mediumHigh",
		6 : "high"
	}
	
	this.acmodes = {
		0 : "off",
		2 : "cool",
		3 : "fan"
	}

	this.sendCommand = function(){
		console.log("send command")
		acmode = this.acmodes[this.targetHeatingCoolingState]
		fanspeed = this.fanspeeds[this.fanspeed]

		console.log("target heating cooling: " + this.targetHeatingCoolingState)
		console.log("acmode: " + acmode)
		console.log("fanspeed: " + fanspeed)
		console.log("temperature: " + this.targetTemperature)

		device = discoveredDevices[this.address]
		if(!this.power||this.targetHeatingCoolingState==Characteristic.TargetHeatingCoolingState.OFF){
			command = this.commands.commands.off;
			device.sendData(Buffer.from(command, 'base64'))
			return;
		}
		if(device==null){
			console.log("can't find the device with ip number " + this.address);
			console.log("sending command failed")
			return
		}

 		command = this.commands.commands[acmode][fanspeed][String(this.targetTemperature)]
 		device.sendData(Buffer.from(command, 'base64'))
	}
  
    
}

module.exports = (homebridge) => {
  ({ Service, Characteristic } = homebridge.hap);

  homebridge.registerAccessory('homebridge-daikin', 'DaikinBroadlink', daikinAircon,true);
};
 
 
 
daikinAircon.prototype = {
	identify: function(callback) {
		console.log("Identify requested: " + this.name);
		callback();
	},
	
	getCurrentHeatingCoolingState: function(callback) {
		console.log("get current heating/cooling state: " + this.currentHeatingCoolingState)
		callback(null, this.currentHeatingCoolingState);
	},

	getTargetHeatingCoolingState: function(callback) {
		console.log("get target heating/cooling state")
		callback(null, this.targetHeatingCoolingState);
	},

	setTargetHeatingCoolingState: function(value, callback, context) {
		console.log(callback);
		console.log("set target heating/cooling state to " + value)
		this.targetHeatingCoolingState = value
		if(value==Characteristic.TargetHeatingCoolingState.OFF){
		  	this.fanservice.getCharacteristic(Characteristic.On).setValue(0, undefined, 'fromSetValue');
		} else {
	  		this.fanservice.getCharacteristic(Characteristic.On).setValue(1, undefined, 'fromSetValue');
		}
		if(callback){
			console.log(context)
			//if(!context) 
			if(context!="fromSetValue") this.sendCommand()
			callback(null,value);
		}
	},
	setCurrentHeatingCoolingState: function(value, callback, context) {
		console.log("set current heating/cooling state")
		this.currentHeatingCoolingState = value
		if(callback){
			if(context!="fromSetValue") this.sendCommand()
			console.log(context)
			//if(!context) 
		}
	},
	
	getCurrentTemperature: function(callback) {
		console.log("get current temperature")
		callback(null, this.currentTemperature);
	},
	
	getTargetTemperature: function(callback) {
		console.log("get target temperature")
		callback(null, this.targetTemperature);
	},
	
	setTargetTemperature: function(value, callback, context) {
		console.log("set target temperature")
		this.targetTemperature = value
		console.log(context)
		//if(!context) 
		if(context!="fromSetValue") this.sendCommand()
		callback(null,value);
	},
	
	getCurrentRelativeHumidity: function(callback) {
		console.log("get current relative humidity")
		callback(null, that.currentRelativeHumidity);
	},
	
	getTargetRelativeHumidity: function(callback) {
		console.log("get target relative humidity")
		callback(null, this.targetHumidity);
	},
	
	setTargetRelativeHumidity: function(value, callback) {
		console.log("set target relative humidity")
		self.targetHumidity = value
		callback(null,value);
	},
	
	getTemperatureDisplayUnits: function(callback) {
		console.log("get temperature display units")
		//this.log("getTemperatureDisplayUnits:", this.temperatureDisplayUnits);
			callback(null, this.temperatureDisplayUnits);
	},
	
	setTemperatureDisplayUnits: function(value, callback) {
			console.log("set temperature display units")
		callback(null, value);
	},
	
	
	setPower: function(value, callback, context) {
		console.log(callback);
		this.power = value;
		if(value){
			console.log("turn on the fan")
		  	if(this.targetHeatingCoolingState==0) this.service.getCharacteristic(Characteristic.TargetHeatingCoolingState).setValue(Characteristic.TargetHeatingCoolingState.COOL, undefined, 'fromSetValue');
		} else {
			console.log("turn off the fan")
	  		if(this.targetHeatingCoolingState>0) this.service.getCharacteristic(Characteristic.TargetHeatingCoolingState).setValue(Characteristic.TargetHeatingCoolingState.OFF, undefined, 'fromSetValue');
		}
// 		this.getCurrentHeatingCoolingState()
		console.log(context) 
		if(context!="fromSetValue") this.sendCommand()
		callback(null,value);
	},
	
	getPower: function(callback) {
		console.log("getting power")
		callback(null, this.power);
	},

	setFanspeed: function(value, callback,context) {
		console.log("set fan speed to " +  value)
		this.fanspeed = value
		if(context!="fromSetValue") this.sendCommand()
		callback(null, value);
	},
	
	getFanspeed: function(callback) {
		console.log("getting fanspeed")
		callback(null, this.fanspeed);
	},

	setTemperature: function(value, callback) {
		console.log("set temperature to " +  value)
		this.currentTemperature = value
		if(callback) callback(null, value);
	},
	setHumidity: function(value, callback) {
		console.log("set humidity to " +  value)
		this.currentRelativeHumidity = value
		if(callback) callback(null, value);
	},
	
	getName: function(callback) {
		this.log("getName :", this.name);
		callback(null, this.name);
	},

	getServices: function() {

		this.informationService = new Service.AccessoryInformation();
		this.informationService
		  .setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
		  .setCharacteristic(Characteristic.Model, this.model)
		  .setCharacteristic(Characteristic.SerialNumber, this.serial);

		this.service
			.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
			.on('get', this.getCurrentHeatingCoolingState.bind(this));

		this.service
			.getCharacteristic(Characteristic.TargetHeatingCoolingState)
			.on('get', this.getTargetHeatingCoolingState.bind(this))
			.on('set', this.setTargetHeatingCoolingState.bind(this));
		
		this.service
			.on('set', this.setCurrentHeatingCoolingState.bind(this));

		
		this.service
			.getCharacteristic(Characteristic.CurrentTemperature)
			.on('get', this.getCurrentTemperature.bind(this));

		this.service
			.getCharacteristic(Characteristic.TargetTemperature)
			.on('get', this.getTargetTemperature.bind(this))
			.on('set', this.setTargetTemperature.bind(this));

		this.service
			.getCharacteristic(Characteristic.TemperatureDisplayUnits)
			.on('get', this.getTemperatureDisplayUnits.bind(this))
			.on('set', this.setTemperatureDisplayUnits.bind(this));

		this.service
			.getCharacteristic(Characteristic.Name)
			.on('get', this.getName.bind(this));

		this.service
			  .getCharacteristic(Characteristic.CurrentRelativeHumidity)
			  .on('get', this.getCurrentRelativeHumidity.bind(this))
			  .on('set', this.setHumidity.bind(this));

/*
		this.service
        	  .getCharacteristic(Characteristic.TargetRelativeHumidity)
        	  .on('get', this.getTargetRelativeHumidity.bind(this))
        	  .on('set', this.setTargetRelativeHumidity.bind(this));
*/


		this.fanservice
			.getCharacteristic(Characteristic.On)
			.on('get', this.getPower.bind(this))
			.on('set', this.setPower.bind(this));

		this.fanservice
			.getCharacteristic(Characteristic.RotationSpeed)
			.on('get', this.getFanspeed.bind(this))
			.on('set', this.setFanspeed.bind(this));


		this.service.getCharacteristic(Characteristic.CurrentTemperature)
			.setProps({
				minValue: 2,
				maxValue: 40,
				minStep: 1
			})
			.on('set', this.setTemperature.bind(this));

		this.service.getCharacteristic(Characteristic.TargetTemperature)
			.setProps({
				minValue: this.minTemp,
				maxValue: this.maxTemp,
				minStep: 1
			});
		return [this.informationService, this.service, this.fanservice];
	}
};
