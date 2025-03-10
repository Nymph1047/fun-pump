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
})