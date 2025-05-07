// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.27;
import './Token.sol';

contract Factory {
    // uint256 public constant TARGET = 3 ether;
    uint256 public constant TOKEN_LIMIT = 500_000 ether;
    uint256 public immutable fee;
    address public owner;
    address[] public tokens;
    uint256 public totalTokens;

    mapping (address => TokenSale) public TokenToSale;
    // each token project,the contribution of each user
    mapping (address => mapping (address => uint256)) contributions;
    mapping (address => address[]) public contributors;

    mapping(address => mapping(address => bool)) public isContributor;


    struct TokenSale {
        address token;
        string name;
        address creator;
        uint256 sold;
        uint256 raised;
        bool isOpen;
        uint256 deadline;
        bool isRefundable;
        uint256 target;
    }

    event Created(address indexed token);
    event Buy(address indexed token,uint256 amount);
    event Refunded(address indexed token, address indexed user, uint256 amount);

    modifier onlyAdminOrCreator(address _token) {
    require(msg.sender == owner || msg.sender == TokenToSale[_token].creator, "Not authorized");
    _;
    }


    constructor(uint256 _fee) {
        fee = _fee;
        owner = msg.sender;
    }

    // function getTokenSale(uint256 _index) public view returns (TokenSale memory) {
    //     return TokenToSale[tokens[_index]];
    // }
    function getTokenSaleByAddress(address _token) public view returns (TokenSale memory) {
    return TokenToSale[_token];
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
        string memory _symbol,
        uint256 _target,
        uint256 _durationInSeconds
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
            true,
            block.timestamp + _durationInSeconds,
            false,
            _target
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
        require(msg.value >= price, "Factory: Insufficient ETH sent");

        uint256 needToRefund = msg.value - price;

        if (needToRefund > 0) {
            payable(msg.sender).transfer(needToRefund);
       }

        if (!isContributor[_token][msg.sender]) {
            contributors[_token].push(msg.sender);
            isContributor[_token][msg.sender] = true;
       }
        // add the contribution to the user
         contributions[_token][msg.sender] += price;

        sale.sold += _amount;
        sale.raised += price;

        if (sale.sold >= TOKEN_LIMIT || sale.raised >= sale.target) {
            sale.isOpen = false;
        }

        Token(_token).transfer(msg.sender, _amount);

        emit Buy(_token, _amount);
    }

    function deposit(address _token) external {
        Token token = Token(_token);
        TokenSale storage sale = TokenToSale[_token];

        require(sale.isOpen == false, "Factory: Target not reached");
        token.transfer(sale.creator, token.balanceOf(address(this)));

        (bool success, ) = payable(sale.creator).call{value: sale.raised}("");
        require(success, "Factory: ETH transfer failed");
    }

    function withdraw(uint256 _amount) external {
        require(msg.sender == owner, "Factory: Not owner");

        (bool success, ) = payable(owner).call{value: _amount}("");
        require(success, "Factory: ETH transfer failed");
    }

    function checkAndClose(address _token) external {
        TokenSale storage sale = TokenToSale[_token];

        require(sale.isOpen == true, "Factory: Already closed");
        if (block.timestamp >= sale.deadline && sale.raised < sale.target) {
            sale.isOpen = false;
            sale.isRefundable = true;
            // refund all contributors

        }
    }
    function refund(address _token) external returns (uint256) {
        TokenSale storage sale = TokenToSale[_token];
        // must be closed and target not reached
        require(sale.isOpen == false, "Factory: Not closed");
        require(sale.raised < sale.target, "Factory: Target reached");
        require(sale.isRefundable, "Factory: Refund not allowed");


        uint256 amount = contributions[_token][msg.sender];
        require(amount > 0, "Factory: No contribution");

        contributions[_token][msg.sender] = 0;


        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "Factory: Refund failed");
        emit Refunded(_token, msg.sender, amount);
        return amount;
    }
    function forceClose(address _token)  external onlyAdminOrCreator(_token) {
        TokenSale storage sale = TokenToSale[_token];

        require(sale.isOpen == true, "Factory: Already closed");

        if (sale.raised < sale.target) { sale.isRefundable = true; }
        sale.isOpen = false;
    }

    function batchRefund(address _token, uint256 start, uint256 end) external {
    TokenSale storage sale = TokenToSale[_token];
    address[] storage userList = contributors[_token];
    require(!sale.isOpen && sale.isRefundable, "Factory: Not refundable");
    if (end > userList.length) end = userList.length;


    for (uint256 i = start; i < end; i++) {
        address user = userList[i];
        uint256 amount = contributions[_token][user];

        if (amount > 0) {
            contributions[_token][user] = 0;

            (bool success, ) = payable(user).call{value: amount}("");
            require(success, "Factory: Refund failed");
        }
    }
    }
    function getContributions(address _token, address _user) external view returns (uint256) {
    return contributions[_token][_user];
    }

    function getContributorsLength(address _token) external view returns (uint256) {
    return contributors[_token].length;
    }

}