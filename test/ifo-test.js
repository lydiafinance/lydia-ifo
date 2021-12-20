const {expect} = require("chai");

const {toWei, mine, getBlockTimestamp, ZERO} = require("./util");

let START_TS;
let END_TS;
let NEXT_RELEASE_TS;

/*
This is a comprehensive test with multiple unlocks.
 */
describe("IFO test 1", function () {
  START_TS = Math.floor(Date.now() / 1000) + 3600; // IFO starts in 1 hour
  END_TS = START_TS + 7200 // IFO wil be live for 2 hours
  NEXT_RELEASE_TS = END_TS + 600;

  let DEPLOYER;
  let ATYS;
  let LYDUS;
  let MANES;
  let POOL1_TESTERS = [];

  let lpToken;
  let offeringToken;
  let ifo;

  let lpDec;
  let offeringDec;

  const testUserInfo = async (address, pool, amount, status, purchased, claimed) => {
    const userInfo = await ifo.viewUserInfo(address, [0, 1]);
    // amountPools
    expect(userInfo[0][pool].toString()).to.equal(toWei(amount));
    // statusPools
    expect(userInfo[1][pool]).to.equal(status);
    // purchasedPools
    expect(userInfo[2][pool].toString()).to.equal(toWei(purchased));
    // claimedPools
    expect(userInfo[3][pool].toString()).to.equal(toWei(claimed));
  }

  const startIfo = async () => {
    const currentTs = await getBlockTimestamp();
    await mine(START_TS - currentTs);
  }

  const endIFO = async () => {
    const currentTs = await getBlockTimestamp();
    await mine(END_TS - currentTs);
  }

  it("0- Setup accounts", async function () {
    const accounts = await ethers.getSigners();
    DEPLOYER = accounts[5];
    ATYS = accounts[6];
    LYDUS = accounts[7];
    MANES = accounts[8];

    // Allocate 30 accounts to test pool 1
    for (let x = 9; x < 39; x++) {
      POOL1_TESTERS.push(accounts[x])
    }
  });

  it("10 Deploy Test Tokens", async function () {
    const Token1 = await ethers.getContractFactory("Token");
    lpToken = await Token1.connect(DEPLOYER).deploy();
    await lpToken.deployed();
    console.log("LP Token address:", lpToken.address);
    lpDec = Number(await lpToken.decimals());

    const Token2 = await ethers.getContractFactory("Token");
    offeringToken = await Token2.connect(DEPLOYER).deploy();
    await offeringToken.deployed();
    console.log("Offering Token address:", offeringToken.address);
    offeringDec = Number(await offeringToken.decimals());
  });

  it("20 Mint Test Tokens", async function () {

    // Mint tokens to test users
    let am = toWei(4000, lpDec);
    await lpToken.functions.mint(ATYS.address, am);
    expect((await lpToken.balanceOf(ATYS.address)).toString()).to.equal(am);

    am = toWei(6000, lpDec)
    await lpToken.functions.mint(LYDUS.address, am);
    expect((await lpToken.balanceOf(LYDUS.address)).toString()).to.equal(am);

    am = toWei(8000, lpDec)
    await lpToken.functions.mint(MANES.address, am);
    expect((await lpToken.balanceOf(MANES.address)).toString()).to.equal(am);

    for (let o = 0; o < POOL1_TESTERS.length; o++) {
      am = toWei(100000, lpDec)
      await lpToken.functions.mint(POOL1_TESTERS[o].address, am);
      expect((await lpToken.balanceOf(POOL1_TESTERS[o].address)).toString()).to.equal(am);
    }

    // Min offering tokens to deployer to use for IFO
    am = toWei(20000, offeringDec);
    await offeringToken.functions.mint(DEPLOYER.address, am);
    expect((await offeringToken.balanceOf(DEPLOYER.address)).toString()).to.equal(am);
  });

  it("30 Deploy IFO contract", async function () {
    const IFO = await ethers.getContractFactory("IFO");

    // Constructor error handling
    await expect(IFO.connect(DEPLOYER).deploy(lpToken.address, lpToken.address, START_TS, END_TS, 10, NEXT_RELEASE_TS, DEPLOYER.address, ZERO, 0)).to.be.revertedWith("Tokens must be be different");
    await expect(IFO.connect(DEPLOYER).deploy(lpToken.address, offeringToken.address, START_TS, END_TS, 101, NEXT_RELEASE_TS, DEPLOYER.address, ZERO, 0)).to.be.revertedWith("Release percent must be in range 1-100");
    await expect(IFO.connect(DEPLOYER).deploy(lpToken.address, offeringToken.address, START_TS, END_TS, 0, NEXT_RELEASE_TS, DEPLOYER.address, ZERO, 0)).to.be.revertedWith("Release percent must be in range 1-100");
    await expect(IFO.connect(DEPLOYER).deploy(lpToken.address, offeringToken.address, START_TS, END_TS, 20, END_TS, DEPLOYER.address, ZERO, 0)).to.be.revertedWith("Next release time must be greater than IFO end time");

    ifo = await IFO.connect(DEPLOYER).deploy(lpToken.address, offeringToken.address, START_TS, END_TS, 20, NEXT_RELEASE_TS, DEPLOYER.address, ZERO, 0);
    await offeringToken.deployed();
    console.log("IFO address:", ifo.address);

    const owner = await ifo.functions.owner();
    expect(owner[0]).to.equal(DEPLOYER.address);
  });

  it("40 Try to deposit", async function () {
    let am = toWei(100, lpDec);

    await expect(ifo.connect(ATYS).depositPool(am, 1)).to.be.revertedWith("Pool not set");
    await expect(ifo.connect(ATYS).depositPool(am, 3)).to.be.revertedWith("Non valid pool id");
  });

  it("50 Try to harvest", async function () {
    await expect(ifo.connect(ATYS).harvestPool(1)).to.be.revertedWith("Too early to harvest");
  });

  it("51 Should not be in preparation period", async function () {
    expect(await (ifo.isPreparationPeriod())).to.equal(false);
  });

  it("60 Set pool 0", async function () {
    // 1 LP token = 0,125 offering token
    const offering = toWei(1000, offeringDec);
    const raising = toWei(8000, lpDec);
    const limitPerUser = toWei(10, offeringDec);
    const hasTax = false;
    const pid = 0;

    await expect(ifo.connect(ATYS).functions.setPool(offering, raising, limitPerUser, hasTax, pid)).to.be.revertedWith("Ownable: caller is not the owner");

    await ifo.functions.setPool(offering, raising, limitPerUser, hasTax, pid);

    const poolInfo = await ifo.functions.viewPoolInformation(0);
    expect(poolInfo[0].toString()).to.equal(raising);
    expect(poolInfo[1].toString()).to.equal(offering);
    expect(poolInfo[2].toString()).to.equal(limitPerUser);
    expect(poolInfo[3]).to.equal(hasTax);
  });

  it("64 Set pool 1", async function () {
    // 1 LP token = 0,125 offering token
    const offering = toWei(2000, offeringDec);
    const raising = toWei(8000, lpDec);

    await ifo.functions.setPool(offering, raising, 0, true, 1);

    const poolInfo = await ifo.functions.viewPoolInformation(1);
    expect(poolInfo[0].toString()).to.equal(raising);
    expect(poolInfo[1].toString()).to.equal(offering);
    expect(poolInfo[2].toString()).to.equal("0");
    expect(poolInfo[3]).to.equal(true);
  });

  it("70 Send token to contract as offering amount", async function () {
    offeringToken.connect(DEPLOYER).functions.transfer(ifo.address, toWei(20000, offeringDec));
  });

  it("80 Approve ifo ", async function () {
    await lpToken.connect(ATYS).functions.approve(ifo.address, toWei(20, lpDec));
    await lpToken.connect(LYDUS).functions.approve(ifo.address, toWei(100, lpDec));

    for (let o = 0; o < POOL1_TESTERS.length; o++) {
      await lpToken.connect(POOL1_TESTERS[o]).functions.approve(ifo.address, toWei(100000, lpDec));
    }
  });

  it("81 Test user info", async function () {
    await testUserInfo(ATYS.address, 0, 0, false, 0, 0);
    await testUserInfo(LYDUS.address, 0, 0, false, 0, 0);
  });

  it("90 Deposit", async function () {
    await expect(ifo.connect(ATYS).depositPool(toWei(100, lpDec), 0)).to.be.revertedWith("Too early");

    await expect(ifo.connect(ATYS).setPrepPeriod(1000)).to.be.revertedWith("Ownable: caller is not the owner");

    await startIfo();

    await expect(ifo.connect(DEPLOYER).setPrepPeriod(1000)).to.be.revertedWith("IFO has started");

    // Commit to pool 0
    await expect(ifo.connect(ATYS).depositPool(0, 0)).to.be.revertedWith("Amount must be > 0");
    await ifo.connect(ATYS).depositPool(toWei(1, lpDec), 0)
    await ifo.connect(ATYS).depositPool(toWei(2, lpDec), 0)
    await ifo.connect(ATYS).depositPool(toWei(6, lpDec), 0)
    await expect(ifo.connect(ATYS).depositPool(toWei(8, lpDec), 0)).to.be.revertedWith("New amount above user limit");

    await ifo.connect(LYDUS).depositPool(toWei(4, lpDec), 0);

    // Commit to pool 1
    for (let o = 0; o < POOL1_TESTERS.length; o++) {
      await ifo.connect(POOL1_TESTERS[o]).depositPool(toWei(100000, lpDec), 1);
    }

    // Should not be in preparation period
    expect(await (ifo.isPreparationPeriod())).to.equal(false);

    await endIFO(); // End the IFO

    await expect(ifo.connect(LYDUS).depositPool(toWei(4, lpDec), 0)).to.be.revertedWith("Too late");
  });

  it("100 Test user info 2", async function () {
    await testUserInfo(ATYS.address, 0, 9, false, 0, 0);
    await testUserInfo(LYDUS.address, 0, 4, false, 0, 0);
  });

  it("101 Should be in preparation period", async function () {
    expect(await (ifo.isPreparationPeriod())).to.equal(true);
    await expect(ifo.connect(ATYS).harvestPool(0)).to.be.revertedWith("In preparation period");
    await mine(7100);
    expect(await (ifo.isPreparationPeriod())).to.equal(true);
    await expect(ifo.connect(LYDUS).harvestPool(0)).to.be.revertedWith("In preparation period");
    await mine(100);
    expect(await (ifo.isPreparationPeriod())).to.equal(false);
  })

  it("110 Harvest 1", async function () {
    // Deposited 9, gets 20% of 9 * 0.125 = 1.125 | 1.125 / 100 * 20 = 0.225

    // Claimable should be 0.225
    expect((await ifo.claimableTokens(ATYS.address, [0]))[0].toString()).to.equal(toWei(0.225, offeringDec));

    await ifo.connect(ATYS).harvestPool(0);
    expect((await offeringToken.functions.balanceOf(ATYS.address)).toString()).to.equal(toWei(0.225, offeringDec));

    // Claimable should be 0
    expect((await ifo.claimableTokens(ATYS.address, [0]))[0].toString()).to.equal(toWei(0, offeringDec));

    // User can harvest again. But should get 0 additional offering tokens.
    await ifo.connect(ATYS).harvestPool(0);
    expect((await offeringToken.functions.balanceOf(ATYS.address)).toString()).to.equal(toWei(0.225, offeringDec));
  });

  it("120 Harvest 2", async function () {
    // Deposited 4, gets 20% of 4 * 0.125 = 0.5 | 0.5 / 100 * 20 = 0.1

    // Claimable should be 0.1
    expect((await ifo.claimableTokens(LYDUS.address, [0]))[0].toString()).to.equal(toWei(0.1, offeringDec));

    await ifo.connect(LYDUS).harvestPool(0);
    expect((await offeringToken.functions.balanceOf(LYDUS.address)).toString()).to.equal(toWei(0.1, offeringDec));

    // Claimable should be 0
    expect((await ifo.claimableTokens(LYDUS.address, [0]))[0].toString()).to.equal(toWei(0, offeringDec));
  });

  it("122 Test user info 3", async function () {
    await testUserInfo(ATYS.address, 0, 9, true, 1.125, 0.225);
    await testUserInfo(LYDUS.address, 0, 4, true, 0.5, 0.1);
  });

  it("130 Release Tokens 50%", async function () {
    await expect(ifo.connect(ATYS).functions.releaseTokens(1, 2)).to.be.revertedWith("Ownable: caller is not the owner");
    await expect(ifo.connect(DEPLOYER).functions.releaseTokens(10, 2)).to.be.revertedWith("Release percent must be greater than its previous value");
    await expect(ifo.connect(DEPLOYER).functions.releaseTokens(40, NEXT_RELEASE_TS)).to.be.revertedWith("Next release timestamp must be greater than current value");
    await expect(ifo.connect(DEPLOYER).functions.releaseTokens(101, NEXT_RELEASE_TS)).to.be.revertedWith("Release percent must be lower or equal to 100");

    await ifo.connect(DEPLOYER).functions.releaseTokens(50, NEXT_RELEASE_TS + 600);

    expect((await ifo.releasedPercent()).toString()).to.equal("50");
    expect((await ifo.nextReleaseTimestamp()).toString()).to.equal(String(NEXT_RELEASE_TS + 600));
  });

  it("140 Harvest 3", async function () {
    // Deposited 9, claimed 20% of 1.125 as 0.225. Now should able to claim 30% of remaining as 0.3375

    // Claimable should be 0.3375
    expect((await ifo.claimableTokens(ATYS.address, [0]))[0].toString()).to.equal(toWei(0.3375, offeringDec));

    await ifo.connect(ATYS).harvestPool(0);

    // Balance should be 0.5625 = 0.225 + 0.3375
    expect((await offeringToken.functions.balanceOf(ATYS.address)).toString()).to.equal(toWei(0.5625, offeringDec));

    // Claimable should be 0 now
    expect((await ifo.claimableTokens(ATYS.address, [0]))[0].toString()).to.equal(toWei(0, offeringDec));

    // User can harvest again. But should get 0 additional offering tokens.
    await ifo.connect(ATYS).harvestPool(0);
    expect((await offeringToken.functions.balanceOf(ATYS.address)).toString()).to.equal(toWei(0.5625, offeringDec));
  });

  it("150 Harvest 4", async function () {
    // Deposited 9, claimed 20% of 0.5 as 0.1. Now should able to claim 30% of remaining as 0.15

    // Claimable should be 0.15
    expect((await ifo.claimableTokens(LYDUS.address, [0]))[0].toString()).to.equal(toWei(0.15, offeringDec));

    await ifo.connect(LYDUS).harvestPool(0);

    // Balance should be 0.25 = 0.1 + 0.15
    expect((await offeringToken.functions.balanceOf(LYDUS.address)).toString()).to.equal(toWei(0.25, offeringDec));

    // Claimable should be 0
    expect((await ifo.claimableTokens(LYDUS.address, [0]))[0].toString()).to.equal(toWei(0, offeringDec));
  });

  it("122 Test user info 4", async function () {
    await testUserInfo(ATYS.address, 0, 9, true, 1.125, 0.5625);
    await testUserInfo(LYDUS.address, 0, 4, true, 0.5, 0.25);
  });

  it("160 Release Tokens 100%", async function () {
    await ifo.connect(DEPLOYER).functions.releaseTokens(100, NEXT_RELEASE_TS + 1200);

    expect((await ifo.releasedPercent()).toString()).to.equal("100");
    expect((await ifo.nextReleaseTimestamp()).toString()).to.equal(String(NEXT_RELEASE_TS + 1200));
  });

  it("170 Harvest 5", async function () {
    // Deposited 9, claimed 50% of 1.125 as 0.5625. Now should able to claim other 50% of remaining as 0.5625

    // Claimable should be 0.5625
    expect((await ifo.claimableTokens(ATYS.address, [0]))[0].toString()).to.equal(toWei(0.5625, offeringDec));

    await ifo.connect(ATYS).harvestPool(0);

    // Balance should be 1.125 = 0.225 + 0.3375 + 0.5625
    expect((await offeringToken.functions.balanceOf(ATYS.address)).toString()).to.equal(toWei(1.125, offeringDec));

    // Claimable should be 0 now
    expect((await ifo.claimableTokens(ATYS.address, [0]))[0].toString()).to.equal(toWei(0, offeringDec));
  });

  it("180 Harvest 6", async function () {
    // Deposited 9, claimed 50% of 0.5 as 0.25. Now should able to claim other 50% of remaining as 0.25

    // Claimable should be 0.25
    expect((await ifo.claimableTokens(LYDUS.address, [0]))[0].toString()).to.equal(toWei(0.25, offeringDec));

    await ifo.connect(LYDUS).harvestPool(0);

    // Balance should be 0.25 = 0.1 + 0.15 + 0.25
    expect((await offeringToken.functions.balanceOf(LYDUS.address)).toString()).to.equal(toWei(0.50, offeringDec));

    // Claimable should be 0
    expect((await ifo.claimableTokens(LYDUS.address, [0]))[0].toString()).to.equal(toWei(0, offeringDec));
  });

  it("122 Test user info 5", async function () {
    await testUserInfo(ATYS.address, 0, 9, true, 1.125, 1.125);
    await testUserInfo(LYDUS.address, 0, 4, true, 0.5, 0.5);
  });
});