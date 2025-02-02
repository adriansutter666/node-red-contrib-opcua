/**

 Copyright 2015 Valmet Automation Inc.

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.

 **/

module.exports = function (RED) {
    "use strict";
    var opcua = require('node-opcua');
    var path = require('path');
    var os = require("os");
    var chalk = require("chalk");
    var async = require("async");
    var opcuaBasics = require('./opcua-basics');
    var installedPath = require('get-installed-path');
    
    function OpcUaServerNode(n) {

        RED.nodes.createNode(this, n);

        this.name = n.name;
        this.port = n.port;
        this.endpoint = n.endpoint;
        this.autoAcceptUnknownCertificate = n.autoAcceptUnknownCertificate;
        // Operating limits:
        this.maxNodesPerBrowse = n.maxNodesPerBrowse;
        this.maxNodesPerHistoryReadData = n.maxNodesPerHistoryReadData;
        this.maxNodesPerHistoryReadEvents = n.maxNodesPerHistoryReadEvents;
        this.maxNodesPerHistoryUpdateData = n.maxNodesPerHistoryUpdateData;
        this.maxNodesPerRead = n.maxNodesPerRead;
        this.maxNodesPerWrite = n.maxNodesPerWrite;
        this.maxNodesPerMethodCall = n.maxNodesPerMethodCall;
        this.maxNodesPerRegisterNodes = n.maxNodesPerRegisterNodes;
        this.maxNodesPerNodeManagement = n.maxNodesPerNodeManagement;
        this.maxMonitoredItemsPerCall = n.maxMonitoredItemsPerCall;
        this.maxNodesPerHistoryUpdateEvents = n.maxNodesPerHistoryUpdateEvents;
        this.maxNodesPerTranslateBrowsePathsToNodeIds = n.maxNodesPerTranslateBrowsePathsToNodeIds;
        this.registerToDiscovery = n.registerToDiscovery;
        var node = this;
        var variables = {
            Counter: 0,
        }
        var equipmentCounter = 0;
        var physicalAssetCounter = 0;
        var equipment;
        var physicalAssets;
        var vendorName;
        var equipmentNotFound = true;
        var initialized = false;
        // var server = null;
        var folder = null;

        function node_error(err) {
            console.error(chalk.red("[Error] Server node error on: " + node.name + " error: " + JSON.stringify(err)));
            node.error("Server node error on: " + node.name + " error: " + JSON.stringify(err));
        }

        function verbose_warn(logMessage) {
            if (RED.settings.verbose) {
                console.warn(chalk.yellow("[Warning] "+ (node.name) ? node.name + ': ' + logMessage : 'OpcUaServerNode: ' + logMessage));
                node.warn((node.name) ? node.name + ': ' + logMessage : 'OpcUaServerNode: ' + logMessage);
            }
        }

        function verbose_log(logMessage) {
            if (RED.settings.verbose) {
                console.log(chalk.cyan(logMessage));
                node.log(logMessage);
            }
        }

        node.status({
            fill: "red",
            shape: "ring",
            text: "Not running"
        });

        var xmlFiles = [  path.join(__dirname, 'public/vendor/opc-foundation/xml/Opc.Ua.NodeSet2.xml'),
            // path.join(__dirname, 'public/vendor/opc-foundation/xml/Opc.ISA95.NodeSet2.xml')
        ];
        verbose_warn("node set:" + xmlFiles.toString());

        async function initNewServer() {
            initialized = false;
            verbose_warn("create Server from XML ...");
            var serverPkg = installedPath.getInstalledPathSync('node-opcua-server', {
                paths: [
                  path.join(__dirname, '..'),
                  path.join(__dirname, '../..'),
                  path.join(process.cwd(), './node_modules'),
                  path.join(process.cwd(), '../node_modules'), // Linux installation needs this
                  path.join(process.cwd(), '.node-red/node_modules'),
                ],
            });
            if (!serverPkg)
                verbose_warn("Cannot find node-opcua-server package with server certificate");

            var rootpki = path.join(serverPkg, "/certificates/PKI");
            var certFile = path.join(serverPkg, "/certificates/server_selfsigned_cert_2048.pem");
            var privFile = path.join(serverPkg, "/certificates/PKI/own/private/private_key.pem");

            const pkiFolder = rootpki; // path.join(configFolder, "pki");
            const userPkiFolder = path.join(serverPkg, "/certificates/userPki");
            const userCertificateManager = new opcua.OPCUACertificateManager({
              automaticallyAcceptUnknownCertificate: true,
              name: "userPki",
              rootFolder: userPkiFolder,
            });
            await userCertificateManager.initialize();
          
            const serverCertificateManager = new opcua.OPCUACertificateManager({
              automaticallyAcceptUnknownCertificate: true,
              name: "pki",
              rootFolder: pkiFolder,
            });    
            await serverCertificateManager.initialize();
          
            verbose_log("Using server certificate " + certFile);
            var registerMethod = null;
            if (node.registerToDiscovery === true) {
                registerMethod = opcua.RegisterServerMethod.LDS;
            }
            node.server_options = {
                serverCertificateManager,
                userCertificateManager,
                certificateFile: certFile,
                privateKeyFile: privFile,
                port: parseInt(n.port),
                maxAllowedSessionNumber: 1000,
                maxConnectionsPerEndpoint: 20,
                nodeset_filename: xmlFiles,
                serverInfo: {
                  // applicationUri: makeApplicationUrn("%FQDN%", "MiniNodeOPCUA-Server"), // Check certificate Uri
                  productUri: "Node-RED NodeOPCUA-Server",
                  // applicationName: { text: "Mini NodeOPCUA Server", locale: "en" }, // Set later
                  gatewayServerUri: null,
                  discoveryProfileUri: null,
                  discoveryUrls: []
                },
                buildInfo: {
                    buildNumber: "0.2.91",
                    buildDate: "2020-12-25T22:00:00"
                },
                serverCapabilities: {
                  maxBrowseContinuationPoints: 10,
                  maxHistoryContinuationPoints: 10,
                  // maxInactiveLockTime,
                  // Get these from the node parameters
                  operationLimits: {
                    maxNodesPerBrowse: node.maxNodesPerBrowse,
                    maxNodesPerHistoryReadData: node.maxNodesPerHistoryReadData,
                    maxNodesPerHistoryReadEvents: node.maxNodesPerHistoryReadEvents,
                    maxNodesPerHistoryUpdateData: node.maxNodesPerHistoryUpdateData,
                    maxNodesPerRead: node.maxNodesPerRead,
                    maxNodesPerWrite: node.maxNodesPerWrite,
                    maxNodesPerMethodCall: node.maxNodesPerMethodCall,
                    maxNodesPerRegisterNodes: node.maxNodesPerRegisterNodes,
                    maxNodesPerNodeManagement: node.maxNodesPerNodeManagement,
                    maxMonitoredItemsPerCall: node.maxMonitoredItemsPerCall,
                    maxNodesPerHistoryUpdateEvents: node.maxNodesPerHistoryUpdateEvents,
                    maxNodesPerTranslateBrowsePathsToNodeIds: node.maxNodesPerTranslateBrowsePathsToNodeIds
                  }
                },
                isAuditing: false,
                registerServerMethod: registerMethod
            };
            node.server_options.serverInfo = {
                applicationName: { text: "Node-RED OPCUA" }
            };
            node.server_options.buildInfo = {
                buildNumber: "0.2.91",
                buildDate: "2020-12-25T22:00:00"
            };
            var hostname = os.hostname();
            var discovery_server_endpointUrl = "opc.tcp://" + hostname + ":4840/UADiscovery";
            if (node.registerToDiscovery === true) {
                verbose_log("Registering server to :" + discovery_server_endpointUrl);
            }
        }

        function construct_my_address_space(addressSpace) {
            verbose_warn("Server add VendorName ...");
            vendorName = addressSpace.getOwnNamespace().addObject({
                organizedBy: addressSpace.rootFolder.objects,
                nodeId: "ns=1;s=VendorName",
                browseName: "VendorName"
            });
            equipment = addressSpace.getOwnNamespace().addObject({
                organizedBy: vendorName,
                nodeId: "ns=1;s=Equipment",
                browseName: "Equipment"
            });

            physicalAssets = addressSpace.getOwnNamespace().addObject({
                organizedBy: vendorName,
                nodeId: "ns=1;s=PhysicalAssets",
                browseName: "Physical Assets"
            });

            verbose_warn('Server add MyVariable2 ...');

            var variable2 = 10.0;

            addressSpace.getOwnNamespace().addVariable({
                componentOf: vendorName,
                nodeId: "ns=1;s=MyVariable2",
                browseName: "MyVariable2",
                dataType: "Double",

                value: {
                    get: function () {
                        return new opcua.Variant({
                            dataType: "Double",
                            value: variable2
                        });
                    },
                    set: function (variant) {
                        variable2 = parseFloat(variant.value);
                        return opcua.StatusCodes.Good;
                    }
                }
            });

            verbose_warn('Server add FreeMemory ...');
            addressSpace.getOwnNamespace().addVariable({
                componentOf: vendorName,
                nodeId: "ns=1;s=FreeMemory",
                browseName: "FreeMemory",
                dataType: "Double",

                value: {
                    get: function () {
                        return new opcua.Variant({
                            dataType: opcua.DataType.Double,
                            value: available_memory()
                        });
                    }
                }
            });

            verbose_warn('Server add Counter ...');
            node.vendorName = addressSpace.getOwnNamespace().addVariable({
                componentOf: vendorName,
                nodeId: "ns=1;s=Counter",
                browseName: "Counter",
                dataType: "UInt16",

                value: {
                    get: function () {
                        return new opcua.Variant({
                            dataType: opcua.DataType.UInt16,
                            value: variables.Counter
                        });
                    }
                }
            });

            var method = addressSpace.getOwnNamespace().addMethod(
                vendorName, {
                    browseName: "Bark",

                    inputArguments: [{
                        name: "nbBarks",
                        description: {
                            text: "specifies the number of time I should bark"
                        },
                        dataType: opcua.DataType.UInt32
                    }, {
                        name: "volume",
                        description: {
                            text: "specifies the sound volume [0 = quiet ,100 = loud]"
                        },
                        dataType: opcua.DataType.UInt32
                    }],

                    outputArguments: [{
                        name: "Barks",
                        description: {
                            text: "the generated barks"
                        },
                        dataType: opcua.DataType.String,
                        valueRank: 1
                    }]
                });

            method.bindMethod(function (inputArguments, context, callback) {

                var nbBarks = inputArguments[0].value;
                var volume = inputArguments[1].value;

                verbose_log("Hello World ! I will bark ", nbBarks, " times");
                verbose_log("the requested volume is ", volume, "");
                var sound_volume = new Array(volume).join("!");

                var barks = [];
                for (var i = 0; i < nbBarks; i++) {
                    barks.push("Whaff" + sound_volume);
                }

                var callMethodResult = {
                    statusCode: opcua.StatusCodes.Good,
                    outputArguments: [{
                        dataType: opcua.DataType.String,
                        arrayType: opcua.VariantArrayType.Array,
                        value: barks
                    }]
                };
                callback(null, callMethodResult);
            });
        }

        function post_initialize() {
            if (node.server) {
                var addressSpace = node.server.engine.addressSpace;
                construct_my_address_space(addressSpace);
                /*
                verbose_log("Next server start...");

                await node.server.start(function () {
                    verbose_warn("Server is now listening ... ( press CTRL+C to stop)");
                    for (const e of node.server.endpoints) {
                        for (const ed of e.endpointDescriptions()) {
                            verbose_log("Server endpointUrl(s): " + ed.endpointUrl + " securityMode: " + ed.securityMode.toString() + " securityPolicyUri: " + ed.securityPolicyUri.toString());
                        }
                    }
                });
                */
                node.status({
                    fill: "green",
                    shape: "dot",
                    text: "running"
                });
                initialized = true;
                verbose_log("server initialized");    

            } else {
                node.status({
                    fill: "gray",
                    shape: "dot",
                    text: "not running"
                });
                node_error("server is not initialized")
            }
        }

        function available_memory() {
            return os.freemem() / os.totalmem() * 100.0;
        }

        (async () => {
            try {
                await initNewServer(); // Read & set parameters
                node.server = new opcua.OPCUAServer(node.server_options);
                node.server.on("post_initialize", () => {
                    construct_my_address_space(node.server.engine.addressSpace);
                });
                                
                await node.server.start();
                // Client connects with userName
                node.server.on("session_activated", (session) => {
                   if (session.userIdentityToken && session.userIdentityToken.userName) {
                       var msg = {};
                       msg.topic="Username";
                       msg.payload = session.sessionName.toString(); // session.clientDescription.applicationName.toString();
                       node.send(msg);
                   }
                });
                // Client connected
                node.server.on("create_session", function(session) {
                   var msg = {};
                   msg.topic="Client-connected";
                   msg.payload = session.sessionName.toString(); // session.clientDescription.applicationName.toString();
                   node.send(msg);
                });
                // Client disconnected
                node.server.on("session_closed", function(session, reason) {
                    console.log("Reason: " + reason);
                   var msg = {};
                   msg.topic="Client-disconnected";
                   msg.payload = session.sessionName.toString(); // session.clientDescription.applicationName.toString() + " " + session.sessionName ? session.sessionName.toString() : "<null>";
                   node.send(msg);
                 });
                 node.status({
                    fill: "green",
                    shape: "dot",
                    text: "running"
                });
                initialized = true;
               }
            catch (err) {
                console.log("Error: " + err);
            }
        })();

        //######################################################################################
        node.on("input", function (msg) {
            verbose_log(JSON.stringify(msg));
            if (node.server === undefined || !initialized) {
                node_error("Server is not running");
                return false;
            }
            var payload = msg.payload;

            if (contains_messageType(payload)) {
                read_message(payload);
            }
            if (contains_opcua_command(payload)) {
                execute_opcua_command(msg);
            }

            if (equipmentNotFound) {
                var addressSpace = node.server.engine.addressSpace; // node.addressSpace;
                if (addressSpace === undefined || addressSpace === null) {
                    node_error("addressSpace undefined");
                    return false;
                }

                var rootFolder = addressSpace.findNode("ns=1;s=VendorName");
                if (!rootFolder) {
                    node_error("VerdorName not found!");
                    return false;
                }
                var references = rootFolder.findReferences("Organizes", true);

                if (findReference(references, equipment.nodeId)) {
                    verbose_warn("Equipment Reference found in VendorName");
                    equipmentNotFound = false;
                } else {
                    verbose_warn("Equipment Reference not found in VendorName");
                }

            }

            node.send(msg);
        });

        function findReference(references, nodeId) {
            return references.filter(function (r) {
                return r.nodeId.toString() === nodeId.toString();
            });
        }

        function contains_messageType(payload) {
            return payload.hasOwnProperty('messageType');
        }

        function read_message(payload) {
            switch (payload.messageType) {
                case 'Variable':
                    variables[payload.variableName] = payload.variableValue;
                    break;
                default:
                    break;
            }
        }

        function contains_opcua_command(payload) {
            return payload.hasOwnProperty('opcuaCommand');
        }

        function execute_opcua_command(msg) {
            var payload = msg.payload;
            var addressSpace = node.server.engine.addressSpace;
            var name;

            switch (payload.opcuaCommand) {

                case "restartOPCUAServer":
                    restart_server();
                    break;

                case "addEquipment":
                    verbose_warn("adding Node".concat(payload.nodeName));
                    equipmentCounter++;
                    name = payload.nodeName.concat(equipmentCounter);

                    addressSpace.getOwnNamespace().addObject({
                        organizedBy: addressSpace.findNode(equipment.nodeId),
                        nodeId: "ns=1;s=".concat(name),
                        browseName: name
                    });
                    break;

                case "addPhysicalAsset":
                    verbose_warn("adding Node".concat(payload.nodeName));
                    physicalAssetCounter++;
                    name = payload.nodeName.concat(physicalAssetCounter);

                    addressSpace.addObject({
                        organizedBy: addressSpace.findNode(physicalAssets.nodeId),
                        nodeId: "ns=1;s=".concat(name),
                        browseName: name
                    });
                    break;

                case "setFolder":
                    verbose_warn("set Folder ".concat(msg.topic)); // Example topic format ns=4;s=FolderName
                    folder = addressSpace.findNode(msg.topic);
                    break;

                case "addFolder":
                    verbose_warn("adding Folder ".concat(msg.topic)); // Example topic format ns=4;s=FolderName
                    msg.payload.device = addressSpace.getOwnNamespace().addObject({
                        organizedBy: addressSpace.rootFolder.objects,
                        browseName: msg.payload.browseName
                    });
                    break;

                case "addVariable":
                    verbose_warn("adding Node ".concat(msg.topic)); // Example topic format ns=4;s=VariableName;datatype=Double
                    var datatype = "";
                    var opcuaDataType = null;
                    var e = msg.topic.indexOf("datatype=");
                    if (e<0) {
                        node_error("no datatype=Float or other type in addVariable ".concat(msg.topic)); // Example topic format ns=4;s=FolderName
                    }
                    var parentFolder = addressSpace.rootFolder.objects;
                    if (folder != null) {
                        parentFolder = folder; // Use previous folder as parent or setFolder() can be use to set parent
                    }

                    if (e > 0) {
                        name = msg.topic.substring(0, e - 1);
                        datatype = msg.topic.substring(e + 9);
                        var browseName = name.substring(7);
                        variables[browseName] = 0;

                        if (datatype == "Int32") {
                            opcuaDataType = opcua.DataType.Int32;
                        }
                        if (datatype == "Int16") {
                            opcuaDataType = opcua.DataType.Int16;
                        }
                        if (datatype == "UInt32") {
                            opcuaDataType = opcua.DataType.UInt32;
                        }
                        if (datatype == "UInt16") {
                            opcuaDataType = opcua.DataType.UInt16;
                        }
                        if (datatype == "Double") {
                            opcuaDataType = opcua.DataType.Double;
                        }
                        if (datatype == "Float") {
                            opcuaDataType = opcua.DataType.Float;
                        }
                        if (datatype == "String") {
                            opcuaDataType = opcua.DataType.String;
                            variables[browseName] = "";
                        }
                        if (datatype == "Boolean") {
                            opcuaDataType = opcua.DataType.Boolean;
                            variables[browseName] = true;
                        }
                        verbose_log(opcuaDataType.toString());
                        addressSpace.getOwnNamespace().addVariable({
                            organizedBy: addressSpace.findNode(parentFolder.nodeId),
                            nodeId: name,
                            browseName: browseName, // or displayName
                            dataType: datatype, // opcuaDataType,
                            value: {
                                get: function () {
                                    return new opcua.Variant({
                                        dataType: opcuaDataType,
                                        value: variables[browseName]
                                    })
                                },
                                set: function (variant) {
                                    variables[browseName] = opcuaBasics.build_new_value_by_datatype(variant.dataType, variant.value);
                                    verbose_log("Server variable: " + variables[browseName] + " browseName: " + browseName);
                                    var SetMsg = { "payload" : { "messageType" : "Variable", "variableName": browseName, "variableValue": variables[browseName] }};
                                    verbose_log("msg Payload:" + JSON.stringify(SetMsg));
                                    node.send(SetMsg);
                                    return opcua.StatusCodes.Good;
                                }
                            }
                        });
                    }
                    break;

                case "installHistorian":
                        verbose_warn("install historian for Node ".concat(msg.topic)); // Example topic format ns=4;s=VariableName;datatype=Double
                        var datatype = "";
                        var opcuaDataType = null;
                        var nodeStr = msg.topic.substring(0, msg.topic.indexOf(";datatype=")); 
                        var e = msg.topic.indexOf("datatype=");
                        if (e<0) {
                            node_error("no datatype=Float or other type in install historian ".concat(msg.topic)); // Example topic format ns=4;s=FolderName
                        }
                        var nodeId = addressSpace.findNode(nodeStr);
                        if (nodeId) {
                          addressSpace.installHistoricalDataNode(nodeId); // no options, use memory as storage
                        }
                        else {
                            node_error("Cannot find node: " + msg.topic + " nodeId: " + nodeStr);
                        }
                    break;

                case "deleteNode":
                    if (addressSpace === undefined) {
                        node_error("addressSpace undefinded");
                        return false;
                    }

                    var searchedNode = addressSpace.findNode(payload.nodeId);
                    if (searchedNode === undefined) {
                        verbose_warn("can not find Node in addressSpace")
                    } else {
                        addressSpace.deleteNode(searchedNode);
                    }
                    break;

                default:
                    node_error("unknown OPC UA Command");
            }
            return msg;
        }

        function restart_server() {
            verbose_warn("Restart OPC UA Server");
            if (node.server) {
                node.server.shutdown(0, function () {
                    node.server = null;
                    vendorName = null;
                    initNewServer();
                });

            } else {
                node.server = null;
                vendorName = null;
                initNewServer();
            }

            if (node.server) {
                verbose_warn("Restart OPC UA Server done");
            } else {
                node_error("can not restart OPC UA Server");
            }
        }

        node.on("close", function () {
            verbose_warn("closing...");
            close_server();
        });

        function close_server() {
            if (node.server) {
                node.server.shutdown(0, function () {
                    node.server = null;
                    vendorName = null;
                });

            } else {
                node.server = null;
                vendorName = null;
            }

        }
    }

    RED.nodes.registerType("OpcUa-Server", OpcUaServerNode);
};
