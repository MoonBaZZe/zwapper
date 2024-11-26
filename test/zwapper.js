const {ethers} = require("hardhat");
const {expect} = require("chai");

async function mineHack(blockNumber) {
    await ethers.provider.send("evm_setAutomine", [false]);
    await ethers.provider.send("evm_setIntervalMining", [0]);

    blockNumber = "0x" + blockNumber.toString(16)
    await ethers.provider.send("hardhat_mine", [blockNumber]);
    // re-enable auto-mining when you are done, so you dont need to manually mine future blocks
    await ethers.provider.send("evm_setAutomine", [true]);
}

describe("Zwapper", function () {
    let owner, user
    let zwapper, zwapperProxy
    let testChainId = 11155111

    before(async function () {
        [owner, user] = await ethers.getSigners();
        await mineHack(100)
    })

    beforeEach(async function () {
        let isSupernova = true
        let minAmount = ethers.utils.parseUnits("0.99", 8)
        if (isSupernova) {
            minAmount = minAmount.mul(1e10)
        }

        let ZwapperFactory = await ethers.getContractFactory("Zwapper");
        zwapper = await ZwapperFactory.connect(owner).deploy(isSupernova, minAmount);
        await zwapper.deployed();

        let ZwapperProxyFactory = await ethers.getContractFactory("ZwapperProxy")
        zwapperProxy = await ZwapperProxyFactory.connect(owner).deploy(zwapper.address, testChainId)
        await zwapperProxy.deployed()

        let allowTx = await zwapper.connect(owner).setChainId(testChainId, true)
        await allowTx.wait()
    })

    it("Should donate, send and emit event", async function () {
        let amount = ethers.utils.parseEther("10")
        await expect(await owner.sendTransaction({
            to: zwapper.address,
            value: amount,
        })).not.to.be.reverted;

        await expect(await ethers.provider.getBalance(zwapper.address)).to.be.equal(amount)

        await expect(await user.sendTransaction({
            to: zwapperProxy.address,
            value: amount,
        })).to.emit(zwapper, "Receive").withArgs(user.address, amount.div(1e10), testChainId);

        await expect(await ethers.provider.getBalance(zwapper.address)).to.be.equal(amount.mul(2))
    });
});