const {expect} = require("chai");

const {mine, getBlockTimestamp, toBN, formatBN} = require("./util");

let START_TS;
let END_TS;
let NEXT_RELEASE_TS;


/*
This test demonstrates a more complex ifo case with 2 pools and both pools overflow.
Single unlock. All tokens distributed once, right after the IFO ends.
*/

describe("IFO test 3", function () {
  START_TS = Math.floor(Date.now() / 1000) + (86400 * 5); // IFO starts in 5 days
  END_TS = START_TS + 7200 // IFO wil be live for 2 hours
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

    // Pool 0 offering/raising
    const offering0 = toBN("30000", offeringDec);
    const raising0 = toBN("6000", lpDec);
    const limit0 = toBN("4000", lpDec);

    // Amounts to commit pool0
    const atysCommits0 = toBN("3500", lpDec);
    const lydusCommits0 = toBN("2250", lpDec);
    const manesCommits0 = toBN("3250", lpDec);

    // Pool 1 offering/raising
    const offering1 = toBN("70000", offeringDec);
    const raising1 = toBN("14000", lpDec);

    const raising = raising0.add(raising1);

    // Amounts to commit pool1
    const atysCommits1 = toBN("9600", lpDec);
    const lydusCommits1 = toBN("8200", lpDec);
    const manesCommits1 = toBN("92540", lpDec);

    const atysCommitsTotal = atysCommits0.add(atysCommits1);
    const lydusCommitsTotal = lydusCommits0.add(lydusCommits1);
    const manesCommitsTotal = manesCommits0.add(manesCommits1);

    // Mint tokens to test users
    await lpToken.functions.mint(ATYS.address, atysCommitsTotal);
    await lpToken.functions.mint(LYDUS.address, lydusCommitsTotal);
    await lpToken.functions.mint(MANES.address, manesCommitsTotal);

    // Mint offering tokens to admin to use for IFO
    const offering = offering0.add(offering1);
    await offeringToken.functions.mint(DEPLOYER.address, offering);

    // Deploy ifo contract
    const IFO = await ethers.getContractFactory("IFO");
    const ifo = await IFO.connect(DEPLOYER).deploy(lpToken.address, offeringToken.address, START_TS, END_TS, 100, NEXT_RELEASE_TS, DEPLOYER.address);
    await offeringToken.deployed();

    // Set pool 0
    await ifo.functions.setPool(offering0, raising0, limit0, false, 0);

    // Set pool 1 with tax
    await ifo.functions.setPool(offering1, raising1, 0, true, 1);

    // Send offering tokens to ifo contract
    offeringToken.connect(DEPLOYER).functions.transfer(ifo.address, offering);

    // Approve ifo
    await lpToken.connect(ATYS).functions.approve(ifo.address, atysCommitsTotal);
    await lpToken.connect(LYDUS).functions.approve(ifo.address, lydusCommitsTotal);
    await lpToken.connect(MANES).functions.approve(ifo.address, manesCommitsTotal);

    // Start ifo, commit tokens
    await startIfo();
    await ifo.connect(ATYS).depositPool(atysCommits0, 0);
    await ifo.connect(LYDUS).depositPool(lydusCommits0, 0);
    await ifo.connect(MANES).depositPool(manesCommits0, 0);

    await ifo.connect(ATYS).depositPool(atysCommits1, 1);
    await ifo.connect(LYDUS).depositPool(lydusCommits1, 1);
    await ifo.connect(MANES).depositPool(manesCommits1, 1);
    await endIFO();

    // Withdraw raised funds
    await ifo.connect(DEPLOYER).withdrawRaised();
    expect((await ifo.raisedWithdrawn())).to.equal(true);
    const raisedLpTokens = await lpToken.balanceOf(DEPLOYER.address);
    // LP token balance of the admin should be equal to total raising amount (all tokens sold)
    expect(raisedLpTokens).to.equal(raising);

    // Get refund & tax amounts
    const [, atysRefunding0,] = (await ifo.viewUserOfferingAndRefundingAmountsForPools(ATYS.address, [0]))[0];
    const [, atysRefunding1, atysTax] = (await ifo.viewUserOfferingAndRefundingAmountsForPools(ATYS.address, [1]))[0];

    const [, lydusRefunding0,] = (await ifo.viewUserOfferingAndRefundingAmountsForPools(LYDUS.address, [0]))[0];
    const [, lydusRefunding1, lydusTax] = (await ifo.viewUserOfferingAndRefundingAmountsForPools(LYDUS.address, [1]))[0];

    const [, manesRefunding0,] = (await ifo.viewUserOfferingAndRefundingAmountsForPools(MANES.address, [0]))[0];
    const [, manesRefunding1, manesTax] = (await ifo.viewUserOfferingAndRefundingAmountsForPools(MANES.address, [1]))[0];

    const allRefundingLp = atysRefunding0.add(atysRefunding1).add(lydusRefunding0).add(lydusRefunding1).add(manesRefunding0).add(manesRefunding1);
    const allTaxLp = atysTax.add(lydusTax).add(manesTax)

    const calculatedLpBalance = allRefundingLp.add(allTaxLp);

    const realLpBalance = await lpToken.balanceOf(ifo.address);

    // This is a known issue as Paladin pointed on their audit report on Issue #03
    // While calculating tax & user refunds the contracts favours users.
    // This makes users to claim very few amounts more lp tokens than it supposed to be while they are harvesting a pool with tax.
    // In this test case that part is .00000002 LP token.
    // We won't make the code complex to fix it but sacrifice a few cents while withdrawing participation fees.
    expect(calculatedLpBalance.gt(realLpBalance)).to.equal(true);

    // Harvest
    await ifo.connect(ATYS).harvestPool(0);
    await ifo.connect(ATYS).harvestPool(1);
    await ifo.connect(LYDUS).harvestPool(0);
    await ifo.connect(LYDUS).harvestPool(1);

    await mine(86400 * 2); // 24 hours passed

    // Call finalWithdraw to withdraw tax leaving a small amount of lp tokens on contract to allow all users to harvest.
    const withdraw = toBN(Math.floor(Number(formatBN(allTaxLp))));
    await ifo.connect(DEPLOYER).finalWithdraw(withdraw, 0);

    // The last user harvesting.
    await ifo.connect(MANES).harvestPool(0);
    await ifo.connect(MANES).harvestPool(1);

    // All offering tokens sold. There may be some dust on the contract
    const ifoOffering = await offeringToken.balanceOf(ifo.address);
    expect(ifoOffering.lt(toBN("000001"))).to.equal(true);
  });
});

