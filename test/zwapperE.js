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

describe("ZwapperE", function () {
    let owner, user, receivingAddress1, receivingAddress2, receivingAddress3, receivingAddress4
    let zwapperE, wxznn

    before(async function () {
        [owner, user, receivingAddress1, receivingAddress2, receivingAddress3, receivingAddress4] = await ethers.getSigners();
        await mineHack(100)
    })

    beforeEach(async function () {
        let minAmount = ethers.utils.parseEther("0.99")
        // Deploy zwapper and set min amount in the constructor
        let ZwapperFactory = await ethers.getContractFactory("ZwapperE");
        zwapperE = await ZwapperFactory.connect(owner).deploy();
        await zwapperE.deployed();

        let amount = ethers.utils.parseUnits("1000", 8)
        // deploy wxznn and send some tokens to the receiving addresses
        let wxznnFactory = await ethers.getContractFactory("WXZNN9")
        wxznn = await wxznnFactory.connect(owner).deploy()
        await wxznn.deployed()

        await expect(owner.sendTransaction({
            to: wxznn.address,
            value: amount,
        })).to.emit(wxznn, "Deposit").
        withArgs(owner.address, amount);

        let transferTx = await wxznn.connect(owner).transfer(receivingAddress1.address, amount.div(3))
        await transferTx.wait()
        await expect(await wxznn.balanceOf(receivingAddress1.address)).to.be.equal(amount.div(3))

        transferTx = await wxznn.connect(owner).transfer(receivingAddress2.address, amount.div(2))
        await transferTx.wait()
        await expect(await wxznn.balanceOf(receivingAddress2.address)).to.be.equal(amount.div(2))

        // Increase allowance for the zwapper
        let approveAmount = ethers.utils.parseEther("10000")
        let approveTx = await wxznn.connect(receivingAddress1).approve(zwapperE.address, approveAmount)
        await approveTx.wait()
        await expect(await wxznn.allowance(receivingAddress1.address, zwapperE.address)).to.be.equal(approveAmount)

        approveTx = await wxznn.connect(receivingAddress2).approve(zwapperE.address, approveAmount)
        await approveTx.wait()

        // Set the chainIds to the receiving addresses
        let chainId = 15
        let listenHeight = 4000
        let setChainIdTx = await zwapperE.connect(owner).setChainId(chainId, receivingAddress1.address, listenHeight)
        await setChainIdTx.wait()

        let receiveInfo = await zwapperE.allowedChainIdMap(chainId)
        await expect(receiveInfo.receiveAddress).to.be.equal(receivingAddress1.address)
        await expect(receiveInfo.listenHeight).to.be.equal(listenHeight)

        chainId = 16
        listenHeight = 5000
        setChainIdTx = await zwapperE.connect(owner).setChainId(chainId, receivingAddress2.address, listenHeight)
        await setChainIdTx.wait()

        receiveInfo = await zwapperE.allowedChainIdMap(chainId)
        await expect(receiveInfo.receiveAddress).to.be.equal(receivingAddress2.address)
        await expect(receiveInfo.listenHeight).to.be.equal(listenHeight)
    })

    it("Should payERC20 from receivingAddresses", async function () {
        let amount = ethers.utils.parseUnits("10", 8)
        let hash = "0x21a3f80c8bf82f0b5cf6af40ea88fc3ecdebf69ba09333ee3e722abe58536949"
        let logIndex = 1
        let sourceChainId = 15

        let oldReceive1Blanace = await wxznn.balanceOf(receivingAddress1.address)
        let oldUserBalance = await wxznn.balanceOf(user.address)
        let payErc20Tx = await zwapperE.connect(owner).payERC20(wxznn.address, user.address, amount, hash, logIndex, sourceChainId)
        await expect(payErc20Tx).to.emit(zwapperE, "Paid").withArgs(hash, logIndex, sourceChainId)

        let newReceive1Blanace = await wxznn.balanceOf(receivingAddress1.address)
        await expect(newReceive1Blanace).to.be.equal(oldReceive1Blanace.sub(amount))
        let newUserBalance = await wxznn.balanceOf(user.address)
        await expect(newUserBalance).to.be.equal(oldUserBalance.add(amount))

        // should pay from the second address
        hash = "0x31a3f80c8bf82f0b5cf6af40ea88fc3ecdebf69ba09333ee3e722abe58536949"
        logIndex = 2
        sourceChainId = 16
        amount = ethers.utils.parseUnits("450", 8)
        let oldReceive2Blanace = await wxznn.balanceOf(receivingAddress2.address)

        oldUserBalance = await wxznn.balanceOf(user.address)
        payErc20Tx = await zwapperE.connect(owner).payERC20(wxznn.address, user.address, amount, hash, logIndex, sourceChainId)
        await expect(payErc20Tx).to.emit(zwapperE, "Paid").withArgs(hash, logIndex, sourceChainId)

        let newReceive2Blanace = await wxznn.balanceOf(receivingAddress2.address)
        await expect(newReceive2Blanace).to.be.equal(oldReceive2Blanace.sub(amount))
        newUserBalance = await wxznn.balanceOf(user.address)
        await expect(newUserBalance).to.be.equal(oldUserBalance.add(amount))

        // should not be able to pay because there are no available funds
        amount = ethers.utils.parseUnits("330", 8)
        logIndex = 3

        oldUserBalance = await wxznn.balanceOf(user.address)
        payErc20Tx = zwapperE.connect(owner).payERC20(wxznn.address, user.address, amount, hash, logIndex, sourceChainId)
        await expect(payErc20Tx).to.be.revertedWith("Not enough funds")
        newUserBalance = await wxznn.balanceOf(user.address)
        await expect(oldUserBalance).to.be.equal(newUserBalance)
    });

    it("Shoud test ownable and mechanics", async function() {
        let amount = ethers.utils.parseUnits("1", 18)

        await expect(user.sendTransaction({
            to: zwapperE.address,
            value: amount,
        })).to.changeEtherBalance(owner, amount)

        let chainId = 17
        let listenHeight = 4500
        let setChainIdTx = zwapperE.connect(user).setChainId(chainId, receivingAddress1.address, listenHeight)
        await expect(setChainIdTx).to.be.revertedWith("Ownable: caller is not the owner")

        let hash = "0x31a3f80c8bf82f0b5cf6af40ea88fc3ecdebf69ba09333ee3e722abe58536949"
        let logIndex = 3
        let sourceChainId = 16
        let payErc20Tx = zwapperE.connect(user).payERC20(wxznn.address, user.address, amount, hash, logIndex, sourceChainId)
        await expect(payErc20Tx).to.be.revertedWith("Ownable: caller is not the owner")

        // Test that chainIds are deleted
        chainId = 16
        listenHeight = 4000
        let receiveInfo = await zwapperE.allowedChainIdMap(chainId)
        let allowedChainId = await zwapperE.allowedChainIdArray(1)
        await expect(allowedChainId).to.be.equal(chainId)
        await expect(receiveInfo.receiveAddress).to.be.equal(receivingAddress2.address)
        setChainIdTx = await zwapperE.connect(owner).setChainId(chainId, ethers.constants.AddressZero, listenHeight)
        await setChainIdTx.wait()
        receiveInfo = await zwapperE.allowedChainIdMap(chainId)
        await expect(receiveInfo.receiveAddress).to.be.equal(ethers.constants.AddressZero)

        // The index does not exist so the call should revert
        await expect(zwapperE.allowedChainIdArray(1)).to.be.reverted

        // Try to pay the chainId 16
        hash = "0x41a3f80c8bf82f0b5cf6af40ea88fc3ecdebf69ba09333ee3e722abe58536949"
        logIndex = 4
        payErc20Tx = zwapperE.connect(owner).payERC20(wxznn.address, user.address, amount, hash, logIndex, chainId)
        await expect(payErc20Tx).to.be.revertedWith("Chain id is not allowed")

        // Try to pay twice the same hash and log
        chainId = 15
        amount = ethers.utils.parseUnits("5", 8)
        payErc20Tx = zwapperE.connect(owner).payERC20(wxznn.address, user.address, amount, hash, logIndex, chainId)
        await expect(payErc20Tx).not.to.be.reverted;

        payErc20Tx = zwapperE.connect(owner).payERC20(wxznn.address, user.address, amount, hash, logIndex, chainId)
        await expect(payErc20Tx).to.be.revertedWith("Transaction hash and log index were already paid")

        // Add chainIds 17, 18 and 16, delete 16, so only 15, 18 and 16 remains
        chainId = 17
        listenHeight = 4000
        setChainIdTx = await zwapperE.connect(owner).setChainId(chainId, receivingAddress2.address, listenHeight)
        await setChainIdTx.wait()

        chainId = 18
        setChainIdTx = await zwapperE.connect(owner).setChainId(chainId, receivingAddress3.address, listenHeight)
        await setChainIdTx.wait()

        chainId = 16
        setChainIdTx = await zwapperE.connect(owner).setChainId(chainId, receivingAddress4.address, listenHeight)
        await setChainIdTx.wait()

        await expect(await zwapperE.allowedChainIdArray(0)).to.be.equal(15)
        await expect(await zwapperE.allowedChainIdArray(1)).to.be.equal(17)
        await expect(await zwapperE.allowedChainIdArray(2)).to.be.equal(18)
        await expect(await zwapperE.allowedChainIdArray(3)).to.be.equal(16)

        chainId = 17
        await expect(await zwapperE.receiveAddressToChainId(receivingAddress2.address)).to.be.equal(17)
        setChainIdTx = await zwapperE.connect(owner).setChainId(chainId, ethers.constants.AddressZero, listenHeight)
        await setChainIdTx.wait()
        receiveInfo = await zwapperE.allowedChainIdMap(chainId)
        await expect(receiveInfo.receiveAddress).to.be.equal(ethers.constants.AddressZero)
        await expect(await zwapperE.receiveAddressToChainId(receivingAddress2.address)).to.be.equal(0)

        await expect(await zwapperE.allowedChainIdArray(0)).to.be.equal(15)
        await expect(await zwapperE.allowedChainIdArray(1)).to.be.equal(18)
        await expect(await zwapperE.allowedChainIdArray(2)).to.be.equal(16)
        await expect(zwapperE.allowedChainIdArray(3)).to.be.reverted;
    })
});