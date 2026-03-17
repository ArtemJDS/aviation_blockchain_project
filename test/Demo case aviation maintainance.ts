import { describe, it } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";
import { keccak256, stringToHex } from "viem";

describe("JetTechnicalPassport", async () => {
  console.log("\n========================================");
  console.log("Jet Technical Passport Demo Test");
  console.log("========================================");

  const { viem } = await hre.network.connect();
  const publicClient = await viem.getPublicClient();

  console.log("[1] Connected to local Hardhat blockchain");
  console.log(`[2] Chain ID: ${await publicClient.getChainId()}\n`);

  const [
    admin,
    owner,
    serviceCenter1,
    serviceCenter2,
    broker,
    outsider,
  ] = await viem.getWalletClients();

  console.log("Actors:");
  console.log(`- Admin:           ${admin.account.address}`);
  console.log(`- Owner:           ${owner.account.address}`);
  console.log(`- Service Center1: ${serviceCenter1.account.address}`);
  console.log(`- Service Center2: ${serviceCenter2.account.address}`);
  console.log(`- Broker:          ${broker.account.address}`);
  console.log(`- Outsider:        ${outsider.account.address}\n`);

  const aircraftId = stringToHex("JET-001", { size: 32 });
  const tailNumber = "M-ABCD";

  async function printTx(txHash: `0x${string}`, label: string) {
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
    console.log(`>>> ${label}`);
    console.log(`tx hash:      ${txHash}`);
    console.log(`block:        ${receipt.blockNumber}`);
    console.log(`gas used:     ${receipt.gasUsed}`);
    console.log(`status:       ${receipt.status}`);
    console.log(`logs emitted: ${receipt.logs.length}`);
    console.log("");
  }

  it("stores encrypted maintenance history and lets authorized broker read it", async () => {
    console.log("STEP A: Deploy contract");
    const contract = await viem.deployContract("JetTechnicalPassport");
    console.log(`Contract deployed at: ${contract.address}\n`);

    console.log("STEP B: Admin approves participants");
    await printTx(
      await contract.write.approveServiceCenter([serviceCenter1.account.address], {
        account: admin.account,
      }),
      "approveServiceCenter(serviceCenter1)"
    );

    await printTx(
      await contract.write.approveServiceCenter([serviceCenter2.account.address], {
        account: admin.account,
      }),
      "approveServiceCenter(serviceCenter2)"
    );

    await printTx(
      await contract.write.approveBroker([broker.account.address], {
        account: admin.account,
      }),
      "approveBroker(broker)"
    );

    console.log("STEP C: Register aircraft");
    await printTx(
      await contract.write.registerAircraft([aircraftId, tailNumber, owner.account.address], {
        account: admin.account,
      }),
      "registerAircraft"
    );

    const aircraft = await contract.read.getAircraft([aircraftId]);
    assert.equal(aircraft[0], tailNumber);
    assert.equal(aircraft[1].toLowerCase(), owner.account.address.toLowerCase());
    console.log(`Aircraft registered: tailNumber=${aircraft[0]}, owner=${aircraft[1]}\n`);

    console.log("STEP D: Service centers add encrypted records");
    const record1Uri = "enc://QmEncryptedMaintenanceReport001";
    const record2Uri = "enc://QmEncryptedRepairReport002";

    const record1Hash = keccak256(stringToHex("Maintenance report #1"));
    const record2Hash = keccak256(stringToHex("Repair report #2"));

    await printTx(
      await contract.write.addRecord([aircraftId, 0, record1Uri, record1Hash], {
        account: serviceCenter1.account,
      }),
      "addRecord(Maintenance)"
    );

    await printTx(
      await contract.write.addRecord([aircraftId, 1, record2Uri, record2Hash], {
        account: serviceCenter2.account,
      }),
      "addRecord(Repair)"
    );

    const recordCount = await contract.read.getRecordCount([aircraftId]);
    assert.equal(recordCount, 2n);
    console.log(`Record count in technical passport: ${recordCount}\n`);

    console.log("STEP E: Broker tries to read before owner authorization");
    await assert.rejects(async () => {
      await contract.read.getRecord([aircraftId, 0n], {
        account: broker.account,
      });
    });
    console.log("Access correctly denied before owner grant.\n");

    console.log("STEP F: Owner grants broker access");
    await printTx(
      await contract.write.grantBrokerAccess([aircraftId, broker.account.address], {
        account: owner.account,
      }),
      "grantBrokerAccess"
    );

    console.log("STEP G: Broker downloads aircraft technical history");
    const firstRecord = await contract.read.getRecord([aircraftId, 0n], {
      account: broker.account,
    });

    const secondRecord = await contract.read.getRecord([aircraftId, 1n], {
      account: broker.account,
    });

    console.log("Record 1:");
    console.log(`- id:               ${firstRecord[0]}`);
    console.log(`- service center:   ${firstRecord[1]}`);
    console.log(`- type:             ${firstRecord[2]} (0=Maintenance)`);
    console.log(`- encrypted URI:    ${firstRecord[3]}`);
    console.log(`- document hash:    ${firstRecord[4]}`);
    console.log(`- timestamp:        ${firstRecord[5]}\n`);

    console.log("Record 2:");
    console.log(`- id:               ${secondRecord[0]}`);
    console.log(`- service center:   ${secondRecord[1]}`);
    console.log(`- type:             ${secondRecord[2]} (1=Repair)`);
    console.log(`- encrypted URI:    ${secondRecord[3]}`);
    console.log(`- document hash:    ${secondRecord[4]}`);
    console.log(`- timestamp:        ${secondRecord[5]}\n`);

    assert.equal(firstRecord[0], 0n);
    assert.equal(firstRecord[3], record1Uri);
    assert.equal(firstRecord[4], record1Hash);

    assert.equal(secondRecord[0], 1n);
    assert.equal(secondRecord[3], record2Uri);
    assert.equal(secondRecord[4], record2Hash);

    console.log("STEP H: Outsider tries to read records");
    await assert.rejects(async () => {
      await contract.read.getRecord([aircraftId, 0n], {
        account: outsider.account,
      });
    });
    console.log("Access correctly denied for outsider.\n");

    console.log("RESULT:");
    console.log("- Certified centers can append encrypted technical records");
    console.log("- Owner controls broker access");
    console.log("- Licensed broker can retrieve full aircraft history after authorization");
    console.log("- Unauthorized users cannot read records");
    console.log("\nTEST PASSED\n");
  });
});