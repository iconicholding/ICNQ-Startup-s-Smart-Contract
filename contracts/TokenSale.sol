pragma solidity 0.4.19;

import "zeppelin-solidity/contracts/lifecycle/Pausable.sol";
import "./custom-zeppelin-solidity/FinalizableCrowdsale.sol";
import "./TokenMold.sol";
import "./Whitelist.sol";

/**
 * @title Token Sale contract - crowdsale of company tokens.
 * @author Gustavo Guimaraes - <gustavoguimaraes@gmail.com>
 */

contract TokenSale is FinalizableCrowdsale, Pausable {
    uint256 public totalTokensForCrowdsale;

    uint256 public firstPhaseEnds;
    uint256 public secondPhaseEnds;

    mapping (address => uint256) public personalPercentCapForFirstPhase;

    // remainderPurchaser and remainderTokens info saved in the contract
    // used for reference for contract owner to send refund if any to last purchaser after end of crowdsale
    address public remainderPurchaser;
    uint256 public remainderAmount;

    // external contracts
    Whitelist public whitelist;
    ERC20Basic public icnq;

    event TokenRateChanged(uint256 previousRate, uint256 newRate);

    /**
     * @dev Contract constructor function
     * @param _startTime The timestamp of the beginning of the crowdsale
     * @param _endTime Timestamp when the crowdsale will finish
     * @param _whitelist contract containing the whitelisted addresses
     * @param _icnqToken ICNQ token contract address
     * @param _incubatorCompanyToken ERC20 TokenMold contract address
     * @param _rate The token rate per ETH
     * @param _wallet Multisig wallet that will hold the crowdsale funds.
     * @param _totalTokensForCrowdsale Cap for the token sale
     */
    function TokenSale
        (
            uint256 _startTime,
            uint256 _firstPhaseEnds,
            uint256 _secondPhaseEnds,
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

        token = createTokenContract(_incubatorCompanyToken);
        whitelist = Whitelist(_whitelist);
        icnq = ERC20Basic(_icnqToken);

        firstPhaseEnds = _firstPhaseEnds;
        secondPhaseEnds = _secondPhaseEnds;
        totalTokensForCrowdsale = _totalTokensForCrowdsale;

        require(TokenMold(token).paused());
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
     * @dev change crowdsale rate
     * @param newRate Figure that corresponds to the new rate per token
     */
    function setRate(uint256 newRate) external onlyOwner {
        require(newRate != 0);

        TokenRateChanged(rate, newRate);
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

            // save info so as to refund purchaser after crowdsale's end
            remainderPurchaser = msg.sender;
            remainderAmount = msg.value.sub(weiAmount);
        }

        // update state
        weiRaised = weiRaised.add(weiAmount);

        token.mint(beneficiary, tokens);
        TokenPurchase(msg.sender, beneficiary, weiAmount, tokens);

        forwardFunds();
    }

    // overriding Crowdsale#hasEnded to add cap logic
    // @return true if crowdsale event has ended
    function hasEnded() public view returns (bool) {
        if (token.totalSupply() == totalTokensForCrowdsale) {
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
        if (now > startTime && now <= firstPhaseEnds) {
            uint256 icnqBalance = icnq.balanceOf(beneficiary);
            uint256 percentageOwnershipAllowance = icnqBalance.mul(100).div(icnq.totalSupply());

            uint256 tokenPurchaseCap = totalTokensForCrowdsale.mul(percentageOwnershipAllowance);
            personalPercentCapForFirstPhase[beneficiary] = tokenPurchaseCap;

            require(token.balanceOf(beneficiary).add(tokens) <= personalPercentCapForFirstPhase[beneficiary]);
        } else if (now > firstPhaseEnds && now <= secondPhaseEnds) {
            require(icnq.balanceOf(beneficiary) > 0);
        }
    }

    /**
     * @dev Creates token contract. This is called on the constructor function of the Crowdsale contract
     * @param _token Address of token contract
     */
    function createTokenContract(address _token) internal returns (MintableToken) {
        return TokenMold(_token);
    }

    /**
     * @dev Override function that finalizes crowdsale
     */
    function finalization() internal {
        if (totalTokensForCrowdsale > token.totalSupply()) {
            uint256 remainingTokens = totalTokensForCrowdsale.sub(token.totalSupply());

            token.mint(wallet, remainingTokens);
        }

        super.finalization();
    }
}
