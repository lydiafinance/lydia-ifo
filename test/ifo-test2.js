const {expect} = require("chai");

const {mine, getBlockTimestamp, toBN} = require("./util");

let START_TS;
let END_TS;
let NEXT_RELEASE_TS;

/*
This test demonstrates a sing pool with tax.
Single unlock. All tokens distributed once, right after the IFO ends.
Users commit their lp token but not all offering tokens get sold.
Admin withdraws raised funds after ifo ends.
*/

describe("IFO test 2", function () {
  START_TS = Math.floor(Date.now() / 1000) + 28800; // IFO starts in 8 hour
  END_TS = START_TS + 7200 // IFO wil be live for 4 hours
  NEXT_RELEASE_TS = END_TS + 600;

  const startIfo = async () => {
    const currentTs = await getBlockTimestamp();
    await mine(START_TS - currentTs);
  }

  const endIFO = async () => {
    const currentTs = await getBlockTimestamp();
    await mine(END_TS - currentTs);
  }

  it("Test", async function () {
    const accounts = await ethers.getSigners();
    const DEPLOYER = accounts[5];
    const ATYS = accounts[6];
    const LYDUS = accounts[7];
    const MANES = accounts[8];

    // Deploy test tokens
    const Token1 = await ethers.getContractFactory("Token");
    const lpToken = await Token1.connect(DEPLOYER).deploy();
    await lpToken.deployed();
    const lpDec = Number(await lpToken.decimals());

    const Token2 = await ethers.getContractFactory("Token");
    const offeringToken = await Token2.connect(DEPLOYER).deploy();
    await offeringToken.deployed();
    const offeringDec = Number(await offeringToken.decimals());

    // Offering/raising amounts
    const offering = toBN("1000000", offeringDec);
    const raising = toBN("3000", lpDec);

    // Amounts to commit
    const atysCommits = toBN("120", lpDec);
    const lydusCommit = toBN("350", lpDec);
    const manesCommits = toBN("250", lpDec);
    const totalCommits = atysCommits.add(lydusCommit).add(manesCommits);

    // Mint tokens to test users
    await lpToken.functions.mint(ATYS.address, atysCommits);
    await lpToken.functions.mint(LYDUS.address, lydusCommit);
    await lpToken.functions.mint(MANES.address, manesCommits);

    // Mint offering tokens to admin to use for IFO
    await offeringToken.functions.mint(DEPLOYER.address, offering);

    // Deploy ifo contract
    const IFO = await ethers.getContractFactory("IFO");
    const ifo = await IFO.connect(DEPLOYER).deploy(lpToken.address, offeringToken.address, START_TS, END_TS, 100, NEXT_RELEASE_TS, DEPLOYER.address);
    await offeringToken.deployed();

    // Set pool with tax (participation fee)
    await ifo.functions.setPool(offering, raising, 0, true, 0);

    // Send offering tokens to ifo contract
    offeringToken.connect(DEPLOYER).functions.transfer(ifo.address, offering);

    // Approve ifo
    await lpToken.connect(ATYS).functions.approve(ifo.address, atysCommits);
    await lpToken.connect(LYDUS).functions.approve(ifo.address, lydusCommit);
    await lpToken.connect(MANES).functions.approve(ifo.address, manesCommits);

    // Update preparation period
    await ifo.connect(DEPLOYER).setPrepPeriod(3600);
    expect(await ifo.prepPeriod()).to.equal(3600);

    // Start ifo, commit tokens
    await startIfo();
    await ifo.connect(ATYS).depositPool(atysCommits, 0);
    await ifo.connect(LYDUS).depositPool(lydusCommit, 0);
    await ifo.connect(MANES).depositPool(manesCommits, 0);

    // Can't withdraw during IFO
    await expect(ifo.connect(DEPLOYER).finalWithdraw(10, 10)).to.be.revertedWith("Can't withdraw now");
    await expect(ifo.connect(DEPLOYER).withdrawRaised()).to.be.revertedWith("Can't withdraw now");

    await endIFO();

    // Withdraw raised funds
    await ifo.connect(DEPLOYER).withdrawRaised();
    const raisedLpTokens = await lpToken.balanceOf(DEPLOYER.address);
    // LP token balance of the admin should be equal to totalCommits
    expect(raisedLpTokens).to.equal(totalCommits);

    await expect(ifo.connect(DEPLOYER).withdrawRaised()).to.be.revertedWith("Already withdrawn");

    // Preparation period ends
    await mine(3600);

    // Harvest
    await ifo.connect(ATYS).harvestPool(0);
    await ifo.connect(LYDUS).harvestPool(0);
    await ifo.connect(MANES).harvestPool(0);

    const atysNewTokens = await offeringToken.balanceOf(ATYS.address);
    const lydusNewTokens = await offeringToken.balanceOf(LYDUS.address);
    const manesNewTokens = await offeringToken.balanceOf(MANES.address);
    const totalNewTokensDistributed = atysNewTokens.add(lydusNewTokens).add(manesNewTokens);

    // No lp token on the contract
    expect((await lpToken.balanceOf(ifo.address)).toString()).to.equal("0");

    const unsoldTokens = offering.sub(totalNewTokensDistributed);

    // Still cant run finalWithdraw
    await expect(ifo.connect(DEPLOYER).finalWithdraw(0, 0)).to.be.revertedWith("Can't withdraw now");

    await mine(86400); // 24 hours passed

    // Still can't run finalWithdraw
    await expect(ifo.connect(DEPLOYER).finalWithdraw(0, 0)).to.be.revertedWith("Can't withdraw now");

    await mine(86400); // 24 hours passed

    // Can call finalWithdraw now. Withdraw unsold offering tokens
    await ifo.connect(DEPLOYER).finalWithdraw(0, unsoldTokens);

    // Admin should have unsold offering tokens
    expect((await offeringToken.balanceOf(DEPLOYER.address)).toString()).to.equal(unsoldTokens.toString());

    // No offering token on the contract
    expect((await offeringToken.balanceOf(ifo.address)).toString()).to.equal("0");

    // No lp tokens on the contract. should revert
    await expect(ifo.connect(DEPLOYER).finalWithdraw(1, 0)).to.be.revertedWith("Not enough LP tokens");
  });
});

