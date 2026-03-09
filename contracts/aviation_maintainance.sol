// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract AviationMaintenance {
    uint256 public constant A_CHECK_HOURS = 600;

    address public admin;
    address public structureInspector;
    address public fuelEngineer;
    address public diagnosticsEngineer;

    enum Status {
        Airworthy,
        ACheckRequired
    }

    struct Aircraft {
        bool exists;
        bool isFlying;
        uint256 flightHours;
        uint256 cycle;
        Status status;
        bool structureSigned;
        bool fuelSigned;
        bool diagnosticsSigned;
    }

    mapping(bytes32 => Aircraft) public aircrafts;

    event AircraftRegistered(bytes32 indexed aircraftId);
    event FlightStarted(bytes32 indexed aircraftId);
    event FlightEnded(bytes32 indexed aircraftId, uint256 hoursFlown, uint256 totalHours);
    event ACheckTriggered(bytes32 indexed aircraftId, uint256 totalHours);
    event StructureSigned(bytes32 indexed aircraftId);
    event FuelSigned(bytes32 indexed aircraftId);
    event DiagnosticsSigned(bytes32 indexed aircraftId);
    event ReturnApproved(bytes32 indexed aircraftId, uint256 newCycle);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }

    modifier onlyStructureInspector() {
        require(msg.sender == structureInspector, "Only structure inspector");
        _;
    }

    modifier onlyFuelEngineer() {
        require(msg.sender == fuelEngineer, "Only fuel engineer");
        _;
    }

    modifier onlyDiagnosticsEngineer() {
        require(msg.sender == diagnosticsEngineer, "Only diagnostics engineer");
        _;
    }

    modifier aircraftExists(bytes32 aircraftId) {
        require(aircrafts[aircraftId].exists, "Aircraft not found");
        _;
    }

    constructor(
        address _structureInspector,
        address _fuelEngineer,
        address _diagnosticsEngineer
    ) {
        admin = msg.sender;
        structureInspector = _structureInspector;
        fuelEngineer = _fuelEngineer;
        diagnosticsEngineer = _diagnosticsEngineer;
    }

    function registerAircraft(bytes32 aircraftId) external onlyAdmin {
        require(!aircrafts[aircraftId].exists, "Aircraft already exists");

        aircrafts[aircraftId] = Aircraft({
            exists: true,
            isFlying: false,
            flightHours: 0,
            cycle: 0,
            status: Status.Airworthy,
            structureSigned: false,
            fuelSigned: false,
            diagnosticsSigned: false
        });

        emit AircraftRegistered(aircraftId);
    }

    function startFlight(bytes32 aircraftId) external aircraftExists(aircraftId) {
        Aircraft storage a = aircrafts[aircraftId];

        require(a.status == Status.Airworthy, "Aircraft requires A-check");
        require(!a.isFlying, "Flight already started");

        a.isFlying = true;
        emit FlightStarted(aircraftId);
    }

    function endFlight(bytes32 aircraftId, uint256 hoursFlown) external aircraftExists(aircraftId) {
        Aircraft storage a = aircrafts[aircraftId];

        require(a.isFlying, "Flight not started");
        require(hoursFlown > 0, "Hours must be > 0");

        a.isFlying = false;
        a.flightHours += hoursFlown;

        emit FlightEnded(aircraftId, hoursFlown, a.flightHours);

        if (a.flightHours >= A_CHECK_HOURS) {
            a.status = Status.ACheckRequired;
            emit ACheckTriggered(aircraftId, a.flightHours);
        }
    }

    function signStructureCheck(bytes32 aircraftId)
        external
        aircraftExists(aircraftId)
        onlyStructureInspector
    {
        Aircraft storage a = aircrafts[aircraftId];
        require(a.status == Status.ACheckRequired, "A-check not required");
        require(!a.structureSigned, "Already signed");

        a.structureSigned = true;
        emit StructureSigned(aircraftId);
    }

    function signFuelCheck(bytes32 aircraftId)
        external
        aircraftExists(aircraftId)
        onlyFuelEngineer
    {
        Aircraft storage a = aircrafts[aircraftId];
        require(a.status == Status.ACheckRequired, "A-check not required");
        require(!a.fuelSigned, "Already signed");

        a.fuelSigned = true;
        emit FuelSigned(aircraftId);
    }

    function signDiagnosticsCheck(bytes32 aircraftId)
        external
        aircraftExists(aircraftId)
        onlyDiagnosticsEngineer
    {
        Aircraft storage a = aircrafts[aircraftId];
        require(a.status == Status.ACheckRequired, "A-check not required");
        require(!a.diagnosticsSigned, "Already signed");

        a.diagnosticsSigned = true;
        emit DiagnosticsSigned(aircraftId);
    }

    function approveReturnToService(bytes32 aircraftId)
        external
        aircraftExists(aircraftId)
        onlyAdmin
    {
        Aircraft storage a = aircrafts[aircraftId];

        require(a.status == Status.ACheckRequired, "A-check not required");
        require(a.structureSigned, "Structure sign missing");
        require(a.fuelSigned, "Fuel sign missing");
        require(a.diagnosticsSigned, "Diagnostics sign missing");

        a.flightHours = 0;
        a.cycle += 1;
        a.status = Status.Airworthy;
        a.structureSigned = false;
        a.fuelSigned = false;
        a.diagnosticsSigned = false;

        emit ReturnApproved(aircraftId, a.cycle);
    }

    function canFly(bytes32 aircraftId) external view aircraftExists(aircraftId) returns (bool) {
        Aircraft storage a = aircrafts[aircraftId];
        return a.status == Status.Airworthy && !a.isFlying;
    }

    function getAircraft(bytes32 aircraftId)
        external
        view
        aircraftExists(aircraftId)
        returns (
            bool isFlying,
            uint256 flightHours,
            uint256 cycle,
            Status status,
            bool structureSigned,
            bool fuelSigned,
            bool diagnosticsSigned
        )
    {
        Aircraft storage a = aircrafts[aircraftId];
        return (
            a.isFlying,
            a.flightHours,
            a.cycle,
            a.status,
            a.structureSigned,
            a.fuelSigned,
            a.diagnosticsSigned
        );
    }
}