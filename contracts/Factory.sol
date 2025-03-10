// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.27;
import './Token.sol';

contract Factory {
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

    event created(address indexed token);
    constructor(uint256 _fee) {
        fee = _fee;
        owner = msg.sender;
    }

    function getTokenSale(uint256 _index) public view returns (TokenSale memory) {
        return TokenToSale[tokens[_index]];
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

        emit created(address(token));
    }
}
