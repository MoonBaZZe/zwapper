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

describe("ZwapperS", function () {
    let owner, user
    let zwapperS, zwapperSProxy, wxznn
    let testChainId = 11155111

    before(async function () {
        [owner, user] = await ethers.getSigners();
        await mineHack(100)
    })

    beforeEach(async function () {
        let minAmount = ethers.utils.parseEther("0.99")
        // Deploy zwapper and set min amount in the constructor
        let ZwapperFactory = await ethers.getContractFactory("ZwapperS");
        zwapperS = await ZwapperFactory.connect(owner).deploy(minAmount);
        await zwapperS.deployed();

        // Deploy the zwapper proxy and set the zwapper anddress and the proxy representing chain id
        let ZwapperProxyFactory = await ethers.getContractFactory("ZwapperSProxy")
        zwapperSProxy = await ZwapperProxyFactory.connect(owner).deploy(zwapperS.address, testChainId)
        await zwapperSProxy.deployed()

        // Allow the chain id on the zwapper
        let allowTx = await zwapperS.connect(owner).setChainId(testChainId, true)
        await allowTx.wait()

        // Fund the zwapper with 10 xznn
        let amount = ethers.utils.parseEther("10")
        await expect(await owner.sendTransaction({
            to: zwapperS.address,
            value: amount,
        })).not.to.be.reverted;
        await expect(await ethers.provider.getBalance(zwapperS.address)).to.be.equal(amount)

        // deploy wxznn and send some tokens to zwapper
        let wxznnFactory = await ethers.getContractFactory("WXZNN9")
        wxznn = await wxznnFactory.connect(owner).deploy()
        await wxznn.deployed()

        await expect(owner.sendTransaction({
            to: wxznn.address,
            value: amount,
        })).to.emit(wxznn, "Deposit").
            withArgs(owner.address, amount);

        let transferTx = await wxznn.connect(owner).transfer(zwapperS.address, amount.div(2))
        await transferTx.wait()
        await expect(await wxznn.balanceOf(zwapperS.address)).to.be.equal(amount.div(2))
    })

    it("Should donate, zwap and emit event", async function () {
        let amount = ethers.utils.parseEther("0.5")
        await expect(user.sendTransaction({
            to: zwapperSProxy.address,
            value: amount,
        })).to.be.revertedWith("Value should be greater than minAmount")

        amount = ethers.utils.parseEther("10")
        await expect(await user.sendTransaction({
            to: zwapperSProxy.address,
            value: amount,
        })).to.emit(zwapperS, "Receive").
            withArgs(user.address, amount.div(1e10), testChainId);

        await expect(await ethers.provider.getBalance(zwapperS.address)).to.be.equal(amount.mul(2))
    });

    it("Should pay the xznn and set the amount as paid", async function () {
        let amount = ethers.utils.parseEther("1")
        let hash = "0x21a3f80c8bf82f0b5cf6af40ea88fc3ecdebf69ba09333ee3e722abe58536949"
        let logIndex = 1
        let sourceChainId = 1

        let oldZwapperBlanace = await ethers.provider.getBalance(zwapperS.address)
        let oldUserBalance = await ethers.provider.getBalance(user.address)
        let payTx = await zwapperS.connect(owner).pay(user.address, amount, hash, logIndex, sourceChainId)
        await expect(payTx).to.emit(zwapperS, "Paid").
            withArgs(hash, logIndex, sourceChainId)

        await expect(await zwapperS.paid(hash, logIndex)).to.be.equal(sourceChainId)
        let newUserBalance = await ethers.provider.getBalance(user.address)
        await expect(newUserBalance).to.be.equal(oldUserBalance.add(amount))
        let newZwapperBlanace = await ethers.provider.getBalance(zwapperS.address)
        await expect(newZwapperBlanace).to.be.equal(oldZwapperBlanace.sub(amount))

        oldZwapperBlanace = await wxznn.balanceOf(zwapperS.address)
        oldUserBalance = await wxznn.balanceOf(user.address)
        hash = "0x31a3f80c8bf82f0b5cf6af40ea88fc3ecdebf69ba09333ee3e722abe58536949"
        logIndex = 3
        payTx = await zwapperS.connect(owner).payERC20(wxznn.address, user.address, amount, hash, logIndex, sourceChainId)
        await expect(payTx).to.emit(zwapperS, "Paid").
            withArgs(hash, logIndex, sourceChainId)

        await expect(await zwapperS.paid(hash, logIndex)).to.be.equal(sourceChainId)
        newUserBalance = await wxznn.balanceOf(user.address)
        await expect(newUserBalance).to.be.equal(oldUserBalance.add(amount))
        newZwapperBlanace = await wxznn.balanceOf(zwapperS.address)
        await expect(newZwapperBlanace).to.be.equal(oldZwapperBlanace.sub(amount))
    });

    it("Shoud test ownable", async function() {
        let amount = ethers.utils.parseEther("5")
        await expect(zwapperS.connect(user).setMinAmount(amount)).
            to.be.revertedWith("Ownable: caller is not the owner")

        let newChainId = 10
        await expect(zwapperS.connect(user).setChainId(newChainId, true)).
            to.be.revertedWith("Ownable: caller is not the owner")

        let hash = "0x21a3f80c8bf82f0b5cf6af40ea88fc3ecdebf69ba09333ee3e722abe58536949"
        let logIndex = 1
        let sourceChainId = 1
        let payTx = zwapperS.connect(user).pay(user.address, amount, hash, logIndex, sourceChainId)
        await expect(payTx).to.be.revertedWith("Ownable: caller is not the owner")

        payTx = zwapperS.connect(user).payERC20(wxznn.address, user.address, amount, hash, logIndex, sourceChainId)
        await expect(payTx).to.be.revertedWith("Ownable: caller is not the owner")
    })
});