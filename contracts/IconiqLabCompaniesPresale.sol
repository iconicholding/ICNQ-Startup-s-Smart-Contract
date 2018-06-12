pragma solidity 0.4.23;

import "zeppelin-solidity/contracts/lifecycle/Pausable.sol";
import "zeppelin-solidity/contracts/token/ERC20/MintableToken.sol";
import "zeppelin-solidity/contracts/token/ERC20/PausableToken.sol";
import "zeppelin-solidity/contracts/crowdsale/FinalizableCrowdsale.sol";
import "./Whitelist.sol";

/**
 * @title Token Sale contract - crowdsale of company tokens.
 * @author Gustavo Guimaraes - <gustavoguimaraes@gmail.com>
 */

contract IconiqLabCompaniesPresale is FinalizableCrowdsale, Pausable {
    uint256 public totalTokensForCrowdsale;

    uint256 public firstPhaseEnds;
    uint256 public secondPhaseEnds;
    uint256 public thirdPhaseEnds;
    address public initialTokenOwner;

    mapping (address => uint256) public personalCap;

    // external contracts
    Whitelist public whitelist;
    ERC20Basic public icnq;

    event PremiunICNQHolderTokenPurchase(address indexed investor, uint256 tokensPurchased);
    event TokenRateChanged(uint256 previousRate, uint256 newRate);

    /**
     * @dev Contract constructor function
     * @param _startTime The timestamp of the beginning of the crowdsale
     * @param _firstPhaseEnds The timestamp of the end of first phase
     * @param _secondPhaseEnds The timestamp of the end of second phase
     * @param _thirdPhaseEnds The timestamp of the end of third phase
     * @param _startTime The timestamp of the beginning of the crowdsale
     * @param _endTime Timestamp when the crowdsale will finish
     * @param _whitelist contract containing the whitelisted addresses
     * @param _icnqToken ICNQ token contract address
     * @param _incubatorCompanyToken ERC20 MintableToken contract address
     * @param _rate The token rate per ETH
     * @param _wallet Multisig wallet that will hold the crowdsale funds.
     * @param _totalTokensForCrowdsale Cap for the token sale in wei format
     */
    constructor(
            uint256 _startTime,
            uint256 _firstPhaseEnds,
            uint256 _secondPhaseEnds,
            uint256 _thirdPhaseEnds,
            uint256 _endTime,
            address _whitelist,
            address _icnqToken,
            address _incubatorCompanyToken,
            uint256 _rate,
            address _wallet,
            uint256 _totalTokensForCrowdsale
        )
        public
        FinalizableCrowdsale()
        Crowdsale(_startTime, _endTime, _rate, _wallet)
     {
        require(
                _whitelist != address(0) &&
                _icnqToken != address(0) &&
                _incubatorCompanyToken != address(0) &&
                _totalTokensForCrowdsale != 0
        );

        token = MintableToken(_incubatorCompanyToken);
        whitelist = Whitelist(_whitelist);
        icnq = ERC20Basic(_icnqToken);

        firstPhaseEnds = _firstPhaseEnds;
        secondPhaseEnds = _secondPhaseEnds;
        thirdPhaseEnds = _thirdPhaseEnds;

        initialTokenOwner = MintableToken(token).owner();
        totalTokensForCrowdsale = _totalTokensForCrowdsale;

        require(PausableToken(token).paused());
    }

    modifier whitelisted(address beneficiary) {
        require(whitelist.isWhitelisted(beneficiary));
        _;
    }

    modifier crowdsaleIsTokenOwner() {
        // token owner should be contract address
        require(token.owner() == address(this));
        _;
    }

    /**
     * @dev Mint tokens for Premium holders of ICNQ tokens ie possesses > 100K
     * @param investorsAddress Investor's address
     * @param tokensPurchased Tokens purchased during pre sale
     */
    function mintTokenForPremiumICNQHolders(address investorsAddress, uint256 tokensPurchased)
        external
        onlyOwner
        whitelisted(investorsAddress)
        crowdsaleIsTokenOwner
    {
        require(now < firstPhaseEnds && investorsAddress != address(0) && icnq.balanceOf(investorsAddress) >= 100000e18);
        require(token.totalSupply().add(tokensPurchased) <= totalTokensForCrowdsale);

        token.mint(investorsAddress, tokensPurchased);
        emit PremiunICNQHolderTokenPurchase(investorsAddress, tokensPurchased);
    }

    /**
     * @dev change crowdsale rate
     * @param newRate Figure that corresponds to the new rate per token
     */
    function setRate(uint256 newRate) external onlyOwner {
        require(newRate != 0);

        emit TokenRateChanged(rate, newRate);
        rate = newRate;
    }

    /**
     * @dev payable function that allow token purchases
     * @param beneficiary Address of the purchaser
     */
    function buyTokens(address beneficiary)
        public
        whenNotPaused
        whitelisted(beneficiary)
        crowdsaleIsTokenOwner
        payable
    {
        // should be coming from a external ethereum account. Not a contract
        require(beneficiary != address(0) && beneficiary == tx.origin);
        require(validPurchase() && token.totalSupply() < totalTokensForCrowdsale);

        uint256 weiAmount = msg.value;

        // calculate token amount to be created
        uint256 tokens = weiAmount.mul(rate);

        checkIcnqHold(beneficiary, tokens);

        //remainder logic
        if (token.totalSupply().add(tokens) > totalTokensForCrowdsale) {
            tokens = totalTokensForCrowdsale.sub(token.totalSupply());
            weiAmount = tokens.div(rate);

            // send remainder wei to sender
            uint256 remainderAmount = msg.value.sub(weiAmount);
            msg.sender.transfer(remainderAmount);
        }

        // update state
        weiRaised = weiRaised.add(weiAmount);

        token.mint(beneficiary, tokens);
        emit TokenPurchase(msg.sender, beneficiary, weiAmount, tokens);

        forwardFunds();
    }

    // override Crowdsale#hasEnded to add cap logic
    // @return true if crowdsale event has ended
    function hasEnded() public view returns (bool) {
        if (token.totalSupply() >= totalTokensForCrowdsale) {
            return true;
        }

        return super.hasEnded();
    }

    /**
     * @dev Check for Icnq hold during token pre sale phase Crowdsale contract
     * @param beneficiary Address of investor
     * @param tokens Tokens to receive
     */
    function checkIcnqHold(address beneficiary, uint256 tokens) internal {
        if (now > firstPhaseEnds && now <= secondPhaseEnds) {
            uint256 icnqBalance = icnq.balanceOf(beneficiary);
            uint256 percentageOwnershipAllowance = icnqBalance.mul(100).div(icnq.totalSupply());

            uint256 tokenPurchaseCap = totalTokensForCrowdsale.mul(percentageOwnershipAllowance);
            personalCap[beneficiary] = tokenPurchaseCap;

            require(token.balanceOf(beneficiary).add(tokens) <= personalCap[beneficiary]);
        } else if (now > secondPhaseEnds && now <= thirdPhaseEnds) {
            require(icnq.balanceOf(beneficiary) > 0);
        }
    }

    /**
     * @dev Override function that finalizes crowdsale
     */
    function finalization() internal {
        token.transferOwnership(initialTokenOwner);
        super.finalization();
    }
}
