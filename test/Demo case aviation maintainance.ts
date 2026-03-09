import { describe, it } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";
import { stringToHex } from "viem";

describe("AviationMaintenance", async () => {
  console.log("\n========================================");
  console.log("Aviation Maintenance Hardhat Test Suite");
  console.log("========================================");

  console.log("[1] Connecting to Hardhat network...");
  const { viem } = await hre.network.connect();
  const publicClient = await viem.getPublicClient();
  console.log("[2] Connection established.");

  const chainId = await publicClient.getChainId();
  const blockNumber = await publicClient.getBlockNumber();
  console.log(`[3] Chain ID: ${chainId}`);
  console.log(`[4] Current block number: ${blockNumber}\n`);

  const [admin, structureInspector, fuelEngineer, diagnosticsEngineer, pilot] =
    await viem.getWalletClients();

  console.log("Available accounts:");
  console.log(`- Admin:                 ${admin.account.address}`);
  console.log(`- Structure Inspector:   ${structureInspector.account.address}`);
  console.log(`- Fuel Engineer:         ${fuelEngineer.account.address}`);
  console.log(`- Diagnostics Engineer:  ${diagnosticsEngineer.account.address}`);
  console.log(`- Pilot:                 ${pilot.account.address}\n`);

  const aircraftId = stringToHex("PK-TEST-001", { size: 32 });
  console.log(`Aircraft ID: ${aircraftId}\n`);

  function statusToText(status: number): string {
    if (status === 0) return "Airworthy";
    if (status === 1) return "A-check Required";
    return "Unknown";
  }

  async function printAircraftState(contract: any, title: string) {
    const aircraft = await contract.read.getAircraft([aircraftId]);
    const canFly = await contract.read.canFly([aircraftId]);

    console.log(`\n--- ${title} ---`);
    console.log(`isFlying:           ${aircraft[0]}`);
    console.log(`flightHours:        ${aircraft[1].toString()}`);
    console.log(`cycle:              ${aircraft[2].toString()}`);
    console.log(`status:             ${statusToText(Number(aircraft[3]))}`);
    console.log(`structureSigned:    ${aircraft[4]}`);
    console.log(`fuelSigned:         ${aircraft[5]}`);
    console.log(`diagnosticsSigned:  ${aircraft[6]}`);
    console.log(`canFly:             ${canFly}`);
    console.log("------------------------------\n");
  }

  async function printTxDetails(
    txHash: `0x${string}`,
    label: string,
    contract?: any
  ) {
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash });

    console.log(`\n>>> ${label}`);
    console.log(`tx hash:            ${txHash}`);
    console.log(`block number:       ${receipt.blockNumber.toString()}`);
    console.log(`gas used:           ${receipt.gasUsed.toString()}`);
    console.log(`status:             ${receipt.status}`);
    console.log(`logs emitted:       ${receipt.logs.length}`);

    if (contract && receipt.logs.length > 0) {
      try {
        const decodedLogs = await contract.getEvents?.allEvents?.({
          fromBlock: receipt.blockNumber,
          toBlock: receipt.blockNumber,
        });

        if (decodedLogs && decodedLogs.length > 0) {
          console.log("decoded events:");
          for (const log of decodedLogs) {
            console.log(`- ${log.eventName}`);
          }
        }
      } catch {
        console.log("decoded events:     unavailable");
      }
    }

    console.log("<<< end tx details\n");
  }

  async function deployFixture() {
    console.log("[5] Deploying AviationMaintenance contract...");

    const contract = await viem.deployContract("AviationMaintenance", [
      structureInspector.account.address,
      fuelEngineer.account.address,
      diagnosticsEngineer.account.address,
    ]);

    console.log(`[6] Contract deployed at: ${contract.address}`);

    console.log("[7] Registering aircraft...");
    const registerTx = await contract.write.registerAircraft([aircraftId], {
      account: admin.account,
    });
    await printTxDetails(registerTx, "registerAircraft()", contract);
    console.log("[8] Aircraft registered successfully.");

    await printAircraftState(contract, "Initial Aircraft State");

    return { contract };
  }

  it("Case 1: blocks flying after 600 flight hours", async () => {
    console.log("\n========================================");
    console.log("TEST CASE 1");
    console.log("When 600 flight hours are completed, blockchain blocks further flight");
    console.log("========================================");

    const { contract } = await deployFixture();

    console.log("[9] Pilot starts flight...");
    const startTx = await contract.write.startFlight([aircraftId], {
      account: pilot.account,
    });
    await printTxDetails(startTx, "startFlight()", contract);
    console.log("[10] Flight started.");
    await printAircraftState(contract, "After startFlight");

    console.log("[11] Pilot ends flight with 600 hours...");
    const endTx = await contract.write.endFlight([aircraftId, 600n], {
      account: pilot.account,
    });
    await printTxDetails(endTx, "endFlight(600)", contract);
    console.log("[12] Flight ended. Checking if A-check was triggered...");
    await printAircraftState(contract, "After endFlight(600)");

    const aircraft = await contract.read.getAircraft([aircraftId]);
    assert.equal(aircraft[1], 600n);
    assert.equal(aircraft[3], 1);

    console.log("[13] Attempting to start another flight. This should fail...");

    await assert.rejects(async () => {
      await contract.write.startFlight([aircraftId], {
        account: pilot.account,
      });
    });

    console.log("[14] Correct result: flight blocked after 600 hours.");
    console.log("TEST CASE 1 PASSED.\n");
  });

  it("Case 2: allows flying again after 3 signs and admin approval", async () => {
    console.log("\n========================================");
    console.log("TEST CASE 2");
    console.log("When 600 hours are reached, 3 signs + admin approval restore permission");
    console.log("========================================");

    const { contract } = await deployFixture();

    console.log("[9] Pilot starts flight...");
    const startTx = await contract.write.startFlight([aircraftId], {
      account: pilot.account,
    });
    await printTxDetails(startTx, "startFlight()", contract);

    console.log("[10] Pilot ends flight with 600 hours...");
    const endTx = await contract.write.endFlight([aircraftId, 600n], {
      account: pilot.account,
    });
    await printTxDetails(endTx, "endFlight(600)", contract);
    console.log("[11] A-check should now be required.");
    await printAircraftState(contract, "After reaching 600 hours");

    console.log("[12] Structure inspector signs...");
    const structureTx = await contract.write.signStructureCheck([aircraftId], {
      account: structureInspector.account,
    });
    await printTxDetails(structureTx, "signStructureCheck()", contract);
    await printAircraftState(contract, "After structure signature");

    console.log("[13] Fuel engineer signs...");
    const fuelTx = await contract.write.signFuelCheck([aircraftId], {
      account: fuelEngineer.account,
    });
    await printTxDetails(fuelTx, "signFuelCheck()", contract);
    await printAircraftState(contract, "After fuel signature");

    console.log("[14] Diagnostics engineer signs...");
    const diagnosticsTx = await contract.write.signDiagnosticsCheck([aircraftId], {
      account: diagnosticsEngineer.account,
    });
    await printTxDetails(diagnosticsTx, "signDiagnosticsCheck()", contract);
    await printAircraftState(contract, "After diagnostics signature");

    console.log("[15] Admin approves return to service...");
    const approveTx = await contract.write.approveReturnToService([aircraftId], {
      account: admin.account,
    });
    await printTxDetails(approveTx, "approveReturnToService()", contract);
    console.log("[16] Return to service approved.");
    await printAircraftState(contract, "After admin approval");

    const aircraft = await contract.read.getAircraft([aircraftId]);
    assert.equal(aircraft[1], 0n);
    assert.equal(aircraft[2], 1n);
    assert.equal(aircraft[3], 0);

    const canFly = await contract.read.canFly([aircraftId]);
    assert.equal(canFly, true);

    console.log("[17] Pilot attempts to start flight again. This should succeed...");
    const restartTx = await contract.write.startFlight([aircraftId], {
      account: pilot.account,
    });
    await printTxDetails(restartTx, "startFlight() after approval", contract);

    const updatedAircraft = await contract.read.getAircraft([aircraftId]);
    assert.equal(updatedAircraft[0], true);

    await printAircraftState(contract, "After flight restart");
    console.log("[18] Correct result: aircraft can fly again after maintenance approval.");
    console.log("TEST CASE 2 PASSED.\n");
  });
});