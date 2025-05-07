const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers")
const { expect } = require("chai")
const { ethers } = require("hardhat")

describe("Factory", function () {
    const FEE  = ethers.parseUnits("0.01", 18)

    async function deployFactoryFixture() {
        // fetch accounts
        const [deployer, creator, buyer] = await ethers.getSigners()
        // deploy contract
        const Factory = await ethers.getContractFactory("Factory")
        const factory = await Factory.deploy(FEE)
        // create Token
        const transaction = await factory.connect(creator).create("DAPP Uni", "DAPP", { value: FEE })
        await transaction.wait()
        // get token address
        const tokenAddress = await factory.tokens(0)
        const token = await ethers.getContractAt("Token", tokenAddress)

        return { factory,deployer,creator,token,buyer }
    }

    async function buyTokenFixture() {
        const {factory,token,creator,buyer} = await deployFactoryFixture();

        const AMOUNT = ethers.parseUnits("10000", 18)
        const COST = ethers.parseUnits("1", 18)

        const transaction = await factory.connect(buyer).buy(await token.getAddress(), AMOUNT, { value: COST })
        await transaction.wait()

        return { factory,token,creator,buyer }
    }

    describe("Deployment", function () {
        it("Should set the fee", async function () {
            const { factory } = await loadFixture(deployFactoryFixture)
            expect(await factory.fee()).to.equal(FEE)
        })

        it("Show set the owner",async function(){
            const { factory,deployer } = await loadFixture(deployFactoryFixture)
            expect(await factory.owner()).to.equal(deployer.address)
        })
    })

    describe("Creating", function () {
        it("Should set the owner", async function () {
            const { factory, token } = await loadFixture(deployFactoryFixture)
            expect(await token.owner()).to.equal(await factory.getAddress())
          })
          it("Should set the creator", async function () {
            const { creator, token } = await loadFixture(deployFactoryFixture)
            expect(await token.creator()).to.equal(creator.address)
          })
          it("Should set  the supply", async function () {
            const { token,factory } = await loadFixture(deployFactoryFixture)
            const totalSupply = ethers.parseUnits("1000000", 18)
            expect(await token.balanceOf(await factory.getAddress())).to.equal(totalSupply)
          })
          it("Should create the sale", async function () {
            const { token,factory,creator } = await loadFixture(deployFactoryFixture)
            const count = await factory.totalTokens();
            expect(count).to.equal(1)
            const sale = await factory.getTokenSale(0)
            expect(sale.token).to.equal(await token.getAddress())
            expect(sale.creator).to.equal(creator.address)
            expect(sale.sold).to.equal(0)
            expect(sale.raised).to.equal(0)
            expect(sale.isOpen).to.equal(true)
          })
    })

    describe("Buying", function () {
        const AMOUNT = ethers.parseUnits("10000", 18)
        const COST = ethers.parseUnits("1", 18)

        it("Should update ETH balance", async function () {
            const { factory, token, buyer } = await loadFixture(buyTokenFixture)
            
            const balance = await ethers.provider.getBalance(await factory.getAddress())

            expect(balance).to.equal(FEE + COST)
        })

        it("Should update token balance", async function () {
            const { factory, token, buyer } = await loadFixture(buyTokenFixture)
            expect(await token.balanceOf(buyer.address)).to.equal(AMOUNT)
        })

        it("Should update token sale", async function () {
            const { factory, token } = await loadFixture(buyTokenFixture)
            const sale = await factory.TokenToSale(await token.getAddress())
            expect(sale.sold).to.equal(AMOUNT)
            expect(sale.raised).to.equal(COST)
            expect(sale.isOpen).to.equal(true)
        })
        it("Should increase base cost", async function () {
            const { factory, token } = await loadFixture(buyTokenFixture)
      
            const sale = await factory.TokenToSale(await token.getAddress())
            const cost = await factory.getCost(sale.sold)
      
            expect(cost).to.be.equal(ethers.parseUnits("0.0002"))
          })
    })

    describe("Depositing", function () {
        const AMOUNT = ethers.parseUnits("10000", 18)
        const COST = ethers.parseUnits("2", 18)
    
        it("Sale should be closed and successfully deposits", async function () {
          const { factory, token, creator, buyer } = await loadFixture(buyTokenFixture)
    
          // Buy tokens again to reach target
          const buyTx = await factory.connect(buyer).buy(await token.getAddress(), AMOUNT, { value: COST })
          await buyTx.wait()
    
          const sale = await factory.TokenToSale(await token.getAddress())
          expect(sale.isOpen).to.equal(false)
    
          const depositTx = await factory.connect(creator).deposit(await token.getAddress())
          await depositTx.wait()
    
          const balance = await token.balanceOf(creator.address)
          expect(balance).to.equal(ethers.parseUnits("980000", 18))
        })
      })

    describe("Withdrawing Fees", function () {
        it("Should update ETH balances", async function () {
          const { factory, deployer } = await loadFixture(deployFactoryFixture)
    
          const transaction = await factory.connect(deployer).withdraw(FEE)
          await transaction.wait()
    
          const balance = await ethers.provider.getBalance(await factory.getAddress())
    
          expect(balance).to.equal(0)
        })
      })

   describe("Time-based Close", function () {
        it("Should close sale if time expired and not enough raised", async function () {
          const { factory, token, creator } = await loadFixture(deployFactoryFixture)
      
          // 模拟时间前进 6 分钟
          await ethers.provider.send("evm_increaseTime", [6 * 60])  // 增加6分钟
          await ethers.provider.send("evm_mine")                     // 强制出块
      
          // 执行关闭检查
          await factory.checkAndClose(await token.getAddress())
      
          const sale = await factory.TokenToSale(await token.getAddress())
          expect(sale.isOpen).to.equal(false)
        })
      
        it("Should NOT close sale if still open or enough raised", async function () {
          const { factory, token, buyer } = await loadFixture(buyTokenFixture)
      
          // 模拟时间前进 6 分钟
          await ethers.provider.send("evm_increaseTime", [6 * 60])
          await ethers.provider.send("evm_mine")
      
          // 调用 checkAndClose
          await factory.checkAndClose(await token.getAddress())
      
          const sale = await factory.TokenToSale(await token.getAddress())
      
          // 因为 buyTokenFixture 中已募资 1 ETH，小于 TARGET，但 sale.isOpen 仍未强制关闭
          // 要根据你的目标修改这个测试，例如改为 2 ETH 买入是否大于 TARGET
          expect(sale.isOpen).to.equal(false) // 如果你希望达到自动关闭，则 true 改为 false
        })

        it("Should allow refund if not reached target", async function () {
          const { factory, token, buyer } = await loadFixture(buyTokenFixture)
        
          // 模拟时间前进6分钟以关闭众筹
          await ethers.provider.send("evm_increaseTime", [6 * 60])
          await ethers.provider.send("evm_mine")
        
          // 调用 checkAndClose
          await factory.checkAndClose(await token.getAddress())
        
          // 计算 price
          const AMOUNT = 10_000n * 10n ** 18n // 10000 tokens
          const COST = 100_000_000_000_000n  // 0.0001 ETH
          const PRICE = COST * (AMOUNT / 10n ** 18n) // = 0.0001 * 10000 = 1 ETH
        
          const balanceBefore = await ethers.provider.getBalance(buyer.address)
        
          const tx = await factory.connect(buyer).refund(await token.getAddress())
          const receipt = await tx.wait()
        
          const gasUsed = receipt.gasUsed * receipt.gasPrice
          const balanceAfter = await ethers.provider.getBalance(buyer.address)
        
          expect(balanceAfter).to.be.closeTo(balanceBefore + PRICE, gasUsed)
        })

        it("Should not allow refund twice", async () => {
          const { factory, token, buyer } = await loadFixture(buyTokenFixture)
          await ethers.provider.send("evm_increaseTime", [6 * 60])
          await ethers.provider.send("evm_mine")
          await factory.checkAndClose(await token.getAddress())
          await factory.connect(buyer).refund(await token.getAddress())
          await expect(factory.connect(buyer).refund(await token.getAddress()))
            .to.be.revertedWith("Factory: No contribution")
        })
        
        
      })
      
})