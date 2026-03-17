// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract JetTechnicalPassport {
    address public admin;

    constructor() {
        admin = msg.sender;
    }

    enum RecordType {
        Maintenance,
        Repair,
        Inspection,
        ComponentReplacement,
        Other
    }

    struct Aircraft {
        bool exists;
        string tailNumber;
        address owner;
    }

    struct Record {
        uint256 id;
        bytes32 aircraftId;
        address serviceCenter;
        RecordType recordType;
        string encryptedDataUri;
        bytes32 documentHash;
        uint256 timestamp;
    }

    mapping(bytes32 => Aircraft) public aircrafts;
    mapping(address => bool) public approvedServiceCenters;
    mapping(address => bool) public approvedBrokers;

    mapping(bytes32 => Record[]) private aircraftRecords;
    mapping(bytes32 => mapping(address => bool)) public brokerAccess;

    event AircraftRegistered(bytes32 indexed aircraftId, string tailNumber, address indexed owner);
    event OwnershipTransferred(bytes32 indexed aircraftId, address indexed oldOwner, address indexed newOwner);

    event ServiceCenterApproved(address indexed serviceCenter);
    event ServiceCenterRevoked(address indexed serviceCenter);

    event BrokerApproved(address indexed broker);
    event BrokerRevoked(address indexed broker);

    event RecordAdded(
        bytes32 indexed aircraftId,
        uint256 indexed recordId,
        address indexed serviceCenter,
        RecordType recordType,
        bytes32 documentHash
    );

    event BrokerAccessGranted(bytes32 indexed aircraftId, address indexed broker);
    event BrokerAccessRevoked(bytes32 indexed aircraftId, address indexed broker);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }

    modifier onlyAircraftOwner(bytes32 aircraftId) {
        require(aircrafts[aircraftId].exists, "Aircraft not found");
        require(aircrafts[aircraftId].owner == msg.sender, "Only aircraft owner");
        _;
    }

    modifier onlyApprovedServiceCenter() {
        require(approvedServiceCenters[msg.sender], "Not approved service center");
        _;
    }

    modifier onlyApprovedBroker() {
        require(approvedBrokers[msg.sender], "Not approved broker");
        _;
    }

    function approveServiceCenter(address serviceCenter) external onlyAdmin {
        approvedServiceCenters[serviceCenter] = true;
        emit ServiceCenterApproved(serviceCenter);
    }

    function revokeServiceCenter(address serviceCenter) external onlyAdmin {
        approvedServiceCenters[serviceCenter] = false;
        emit ServiceCenterRevoked(serviceCenter);
    }

    function approveBroker(address broker) external onlyAdmin {
        approvedBrokers[broker] = true;
        emit BrokerApproved(broker);
    }

    function revokeBroker(address broker) external onlyAdmin {
        approvedBrokers[broker] = false;
        emit BrokerRevoked(broker);
    }

    function registerAircraft(bytes32 aircraftId, string calldata tailNumber, address owner) external onlyAdmin {
        require(!aircrafts[aircraftId].exists, "Aircraft already exists");

        aircrafts[aircraftId] = Aircraft({
            exists: true,
            tailNumber: tailNumber,
            owner: owner
        });

        emit AircraftRegistered(aircraftId, tailNumber, owner);
    }

    function transferOwnership(bytes32 aircraftId, address newOwner) external onlyAircraftOwner(aircraftId) {
        require(newOwner != address(0), "Invalid new owner");

        address oldOwner = aircrafts[aircraftId].owner;
        aircrafts[aircraftId].owner = newOwner;

        emit OwnershipTransferred(aircraftId, oldOwner, newOwner);
    }

    function addRecord(
        bytes32 aircraftId,
        RecordType recordType,
        string calldata encryptedDataUri,
        bytes32 documentHash
    ) external onlyApprovedServiceCenter {
        require(aircrafts[aircraftId].exists, "Aircraft not found");
        require(bytes(encryptedDataUri).length > 0, "Empty data URI");
        require(documentHash != bytes32(0), "Empty document hash");

        uint256 recordId = aircraftRecords[aircraftId].length;

        aircraftRecords[aircraftId].push(
            Record({
                id: recordId,
                aircraftId: aircraftId,
                serviceCenter: msg.sender,
                recordType: recordType,
                encryptedDataUri: encryptedDataUri,
                documentHash: documentHash,
                timestamp: block.timestamp
            })
        );

        emit RecordAdded(aircraftId, recordId, msg.sender, recordType, documentHash);
    }

    function grantBrokerAccess(bytes32 aircraftId, address broker)
        external
        onlyAircraftOwner(aircraftId)
    {
        require(approvedBrokers[broker], "Broker not approved");

        brokerAccess[aircraftId][broker] = true;
        emit BrokerAccessGranted(aircraftId, broker);
    }

    function revokeBrokerAccess(bytes32 aircraftId, address broker)
        external
        onlyAircraftOwner(aircraftId)
    {
        brokerAccess[aircraftId][broker] = false;
        emit BrokerAccessRevoked(aircraftId, broker);
    }

    function getAircraft(bytes32 aircraftId)
        external
        view
        returns (string memory tailNumber, address owner)
    {
        require(aircrafts[aircraftId].exists, "Aircraft not found");
        Aircraft storage a = aircrafts[aircraftId];
        return (a.tailNumber, a.owner);
    }

    function getRecordCount(bytes32 aircraftId) external view returns (uint256) {
        require(aircrafts[aircraftId].exists, "Aircraft not found");
        return aircraftRecords[aircraftId].length;
    }

    function getRecord(bytes32 aircraftId, uint256 index)
        external
        view
        onlyApprovedBroker
        returns (
            uint256 id,
            address serviceCenter,
            RecordType recordType,
            string memory encryptedDataUri,
            bytes32 documentHash,
            uint256 timestamp
        )
    {
        require(aircrafts[aircraftId].exists, "Aircraft not found");
        require(brokerAccess[aircraftId][msg.sender], "Broker has no access");
        require(index < aircraftRecords[aircraftId].length, "Record not found");

        Record storage r = aircraftRecords[aircraftId][index];

        return (
            r.id,
            r.serviceCenter,
            r.recordType,
            r.encryptedDataUri,
            r.documentHash,
            r.timestamp
        );
    }
}