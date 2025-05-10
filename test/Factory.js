const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers")
const { expect } = require("chai")
const { ethers } = require("hardhat")

describe("Factory", function () {
  const FEE = ethers.parseUnits("0.01", 18)

  async function deployFactoryFixture() {
    const [deployer, creator, buyer] = await ethers.getSigners()
    const Factory = await ethers.getContractFactory("Factory")
    const factory = await Factory.deploy(FEE)

    const target = ethers.parseUnits("2", 18)
    const duration = 300 // 5 minutes
    const limit = ethers.parseUnits("20000", 18)

    const tx = await factory.connect(creator).create("DAPP Uni", "DAPP", target, duration, limit, { value: FEE })
    await tx.wait()

    const tokenAddress = await factory.tokens(0)
    const token = await ethers.getContractAt("Token", tokenAddress)

    return { factory, deployer, creator, token, buyer, target, limit }
  }

  async function buyTokenFixture() {
    const { factory, token, creator, buyer } = await deployFactoryFixture()
    const AMOUNT = ethers.parseUnits("10000", 18)
    const COST = ethers.parseUnits("1", 18)

    const tx = await factory.connect(buyer).buy(await token.getAddress(), AMOUNT, { value: COST })
    await tx.wait()

    return { factory, token, creator, buyer, AMOUNT, COST }
  }

  describe("Deployment", function () {
    it("Should set the fee", async function () {
      const { factory } = await loadFixture(deployFactoryFixture)
      expect(await factory.fee()).to.equal(FEE)
    })

    it("Should set the owner", async function () {
      const { factory, deployer } = await loadFixture(deployFactoryFixture)
      expect(await factory.owner()).to.equal(deployer.address)
    })
  })

  describe("Creating", function () {
    it("Should assign the token to the factory", async function () {
      const { factory, token } = await loadFixture(deployFactoryFixture)
      expect(await token.owner()).to.equal(await factory.getAddress())
    })

    it("Should set the creator", async function () {
      const { creator, token } = await loadFixture(deployFactoryFixture)
      expect(await token.creator()).to.equal(creator.address)
    })

    it("Should set total supply to factory", async function () {
      const { token, factory } = await loadFixture(deployFactoryFixture)
      const totalSupply = ethers.parseUnits("1000000", 18)
      expect(await token.balanceOf(await factory.getAddress())).to.equal(totalSupply)
    })

    it("Should store correct sale info", async function () {
      const { token, factory, creator } = await loadFixture(deployFactoryFixture)
      const sale = await factory.getTokenSaleByAddress(await token.getAddress())
      expect(sale.token).to.equal(await token.getAddress())
      expect(sale.creator).to.equal(creator.address)
      expect(sale.sold).to.equal(0)
      expect(sale.raised).to.equal(0)
      expect(sale.isOpen).to.equal(true)
    })
  })

  describe("Buying", function () {
    it("Should update balances after purchase", async function () {
      const { factory, token, buyer, AMOUNT, COST } = await loadFixture(buyTokenFixture)

      const balance = await ethers.provider.getBalance(await factory.getAddress())
      expect(balance).to.equal(FEE + COST)

      expect(await token.balanceOf(buyer.address)).to.equal(AMOUNT)

      const sale = await factory.getTokenSaleByAddress(await token.getAddress())
      expect(sale.sold).to.equal(AMOUNT)
      expect(sale.raised).to.equal(COST)
    })

    it("Should increase cost after buying", async function () {
      const { factory, token } = await loadFixture(buyTokenFixture)
      const sale = await factory.getTokenSaleByAddress(await token.getAddress())
      const cost = await factory.getCost(sale.sold)
      expect(cost).to.equal(ethers.parseUnits("0.0002", 18))
    })
  })

  describe("Depositing", function () {
    it("Should transfer remaining tokens and ETH to creator", async function () {
      const { factory, token, creator, buyer } = await loadFixture(buyTokenFixture)
      const AMOUNT = ethers.parseUnits("10000", 18)
      const COST = ethers.parseUnits("2", 18)

      await factory.connect(buyer).buy(await token.getAddress(), AMOUNT, { value: COST })

      const sale = await factory.getTokenSaleByAddress(await token.getAddress())
      expect(sale.isOpen).to.equal(false)

      await factory.connect(creator).deposit(await token.getAddress())

      const balance = await token.balanceOf(creator.address)
      expect(balance).to.equal(ethers.parseUnits("980000", 18))
    })
  })

  describe("Withdraw", function () {
    it("Should allow owner to withdraw fee", async function () {
      const { factory, deployer } = await loadFixture(deployFactoryFixture)

      await factory.connect(deployer).withdraw(FEE)
      const balance = await ethers.provider.getBalance(await factory.getAddress())
      expect(balance).to.equal(0)
    })
  })

  describe("Close & Refund", function () {
    it("Should close if deadline passed and not raised enough", async function () {
      const { factory, token } = await loadFixture(deployFactoryFixture)
      await ethers.provider.send("evm_increaseTime", [360])
      await ethers.provider.send("evm_mine")

      await factory.checkAndClose(await token.getAddress())
      const sale = await factory.getTokenSaleByAddress(await token.getAddress())
      expect(sale.isOpen).to.equal(false)
    })

    it("Should allow refund if sale closed and not met target", async function () {
      const { factory, token, buyer } = await loadFixture(buyTokenFixture)
      await ethers.provider.send("evm_increaseTime", [360])
      await ethers.provider.send("evm_mine")

      await factory.checkAndClose(await token.getAddress())

      const before = await ethers.provider.getBalance(buyer.address)
      const tx = await factory.connect(buyer).refund(await token.getAddress())
      const receipt = await tx.wait()
      const gas = receipt.gasUsed * receipt.gasPrice
      const after = await ethers.provider.getBalance(buyer.address)

      expect(after).to.be.closeTo(before + ethers.parseUnits("1", 18), gas)
    })

    it("Should not allow double refund", async () => {
      const { factory, token, buyer } = await loadFixture(buyTokenFixture)
      await ethers.provider.send("evm_increaseTime", [360])
      await ethers.provider.send("evm_mine")
      await factory.checkAndClose(await token.getAddress())
      await factory.connect(buyer).refund(await token.getAddress())
      await expect(factory.connect(buyer).refund(await token.getAddress())).to.be.revertedWith("Factory: No contribution")
    })
  })

  describe("Permission Control", function () {
    it("Should allow owner to forceClose", async function () {
      const { factory, token, deployer } = await loadFixture(deployFactoryFixture);
      await expect(factory.connect(deployer).forceClose(await token.getAddress()))
        .to.emit(factory, "ForceClosed");
    });
  
    it("Should allow creator to forceClose", async function () {
      const { factory, token, creator } = await loadFixture(deployFactoryFixture);
      await expect(factory.connect(creator).forceClose(await token.getAddress()))
        .to.emit(factory, "ForceClosed");
    });
  
    it("Should reject non-creator/non-owner from forceClose", async function () {
      const { factory, token, buyer } = await loadFixture(deployFactoryFixture);
      await expect(factory.connect(buyer).forceClose(await token.getAddress()))
        .to.be.revertedWith("Not authorized");
    });
  });

  describe("Batch Refunds", function () {
    it("Should refund multiple users", async () => {
      const { factory, token, creator } = await loadFixture(deployFactoryFixture)
      const [_, __, buyer1, buyer2, buyer3] = await ethers.getSigners()
    
      const AMOUNT = ethers.parseUnits("1000", 18)
      const UNIT = ethers.parseUnits("1", 18)
    
      // 第一个用户购买
      let cost1 = await factory.getCost(0)
      let tokensToBuy1 = AMOUNT / UNIT
      let price1 = cost1 * tokensToBuy1
      await factory.connect(buyer1).buy(await token.getAddress(), AMOUNT, {
        value: price1 + ethers.parseUnits("0.001", 18)
      })
    
      // 第二个用户购买
      let cost2 = await factory.getCost(AMOUNT)
      let tokensToBuy2 = AMOUNT / UNIT
      let price2 = cost2 * tokensToBuy2
      await factory.connect(buyer2).buy(await token.getAddress(), AMOUNT, {
        value: price2 + ethers.parseUnits("0.001", 18)
      })
    
      // 第三个用户购买
      let cost3 = await factory.getCost(AMOUNT * 2n)
      let tokensToBuy3 = AMOUNT / UNIT
      let price3 = cost3 * tokensToBuy3
      await factory.connect(buyer3).buy(await token.getAddress(), AMOUNT, {
        value: price3 + ethers.parseUnits("0.001", 18)
      })
    
      // 模拟时间关闭众筹
      await ethers.provider.send("evm_increaseTime", [3600])
      await ethers.provider.send("evm_mine")
      await factory.checkAndClose(await token.getAddress())
    
      const before1 = await ethers.provider.getBalance(buyer1.address)
      const before2 = await ethers.provider.getBalance(buyer2.address)
      const before3 = await ethers.provider.getBalance(buyer3.address)
    
      const tx = await factory.connect(creator).batchRefund(await token.getAddress(), 0, 3)
      await tx.wait()
    
      const after1 = await ethers.provider.getBalance(buyer1.address)
      const after2 = await ethers.provider.getBalance(buyer2.address)
      const after3 = await ethers.provider.getBalance(buyer3.address)
    
      expect(after1).to.be.gt(before1)
      expect(after2).to.be.gt(before2)
      expect(after3).to.be.gt(before3)
    })
    
  
    it("Should revert if not refundable", async () => {
      const { factory, token, creator } = await loadFixture(deployFactoryFixture)
      await expect(factory.connect(creator).batchRefund(await token.getAddress(), 0, 1))
        .to.be.revertedWith("Factory: Not refundable")
    })
  
    it("Should handle end > length gracefully", async () => {
      const { factory, token, buyer } = await loadFixture(buyTokenFixture)
  
      await ethers.provider.send("evm_increaseTime", [3600])
      await ethers.provider.send("evm_mine")
      await factory.checkAndClose(await token.getAddress())
  
      const tx = await factory.batchRefund(await token.getAddress(), 0, 100) // 多于实际人数
      await tx.wait()
  
      const sale = await factory.TokenToSale(await token.getAddress())
      expect(sale.isRefundable).to.equal(true)
    })
  })
  
  
})
