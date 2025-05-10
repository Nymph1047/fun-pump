import { ethers } from "ethers"

function List({ toggleCreate, fee, provider, factory,loadBlockchainData }) {
  async function listHandler(form) {
    const name = form.get("name")
    const ticker = form.get("ticker")
    const target =  ethers.parseEther(form.get("target"));
    const duration = BigInt(form.get("duration"));
    const limit =  ethers.parseEther(form.get("limit")) ;

    const signer = await provider.getSigner()
    const transaction = await factory.connect(signer).create(name, ticker, target, duration,limit, { value: fee })
    await transaction.wait()

    toggleCreate()
  }

  return (
    <div className="list">
      <h2>list new token</h2>

      <div className="list__description">
        <p>fee: {ethers.formatUnits(fee, 18)} ETH</p>
      </div>

      <form action={listHandler}>
        <input type="text" name="name" placeholder="name" />
        <input type="text" name="ticker" placeholder="ticker" />
        <input type="text" name="target" placeholder="target" />
        <input type="text" name="duration" placeholder="duration" />
        <input type="text" name="limit" placeholder="limit" />
        <input type="submit" value="[ list ]" />
      </form>

      <button onClick={toggleCreate} className="btn--fancy">[ cancel ]</button>
    </div>
  );
}

export default List;