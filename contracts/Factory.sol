// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.27;
import './Token.sol';

contract Factory {
    uint256 public constant TARGET = 3 ether;
    uint256 public constant TOKEN_LIMIT = 500_000 ether;
    uint256 public immutable fee;
    address public owner;
    address[] public tokens;
    uint256 public totalTokens;

    mapping (address => TokenSale) public TokenToSale;

    struct TokenSale {
        address token;
        string name;
        address creator;
        uint256 sold;
        uint256 raised;
        bool isOpen;
    }

    event Created(address indexed token);
    event Buy(address indexed token,uint256 amount);

    constructor(uint256 _fee) {
        fee = _fee;
        owner = msg.sender;
    }

    function getTokenSale(uint256 _index) public view returns (TokenSale memory) {
        return TokenToSale[tokens[_index]];
    }

    function getCost(uint256 _sold) public pure returns (uint256) {
        uint256 floor = 0.0001 ether;
        uint256 step = 0.0001 ether;
        uint256 increment = 10000 ether;

        uint256 cost = (step * (_sold / increment)) + floor;
        return cost;
    }

    function create(
        string memory _name,
        string memory _symbol
    ) external payable {

        require(msg.value >= fee, "Factory: Creator fee not met");

        // Create a new contract
        Token token = new Token(msg.sender, _name, _symbol, 1_000_000 ether);
        tokens.push(address(token));
        totalTokens++;

        TokenSale memory sale =  TokenSale(
            address(token),
            _name,
            msg.sender,
            0,
            0,
            true
        );

        TokenToSale[address(token)] = sale;

        emit Created(address(token));
    }

    function buy(address _token, uint256 _amount) external payable {
        TokenSale storage sale = TokenToSale[_token];


        require(sale.isOpen == true, "Factory: Buying closed");
        require(_amount >= 1 ether, "Factory: Amount too low");
        require(_amount <= 10000 ether, "Factory: Amount exceeded");

        uint256 cost = getCost(sale.sold);
        uint256 price = cost * (_amount / 10 ** 18);

        sale.sold += _amount;
        sale.raised += price;

        if (sale.sold >= TOKEN_LIMIT || sale.raised >= TARGET) {
            sale.isOpen = false;
        }

        Token(_token).transfer(msg.sender, _amount);

        emit Buy(_token, _amount);
    }

    function deposit(address _token) external {
        require(msg.value > 0, "Factory: No value sent");
    }
}
