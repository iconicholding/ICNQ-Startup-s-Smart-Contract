const IconiqLabCompaniesPresale = artifacts.require(
    './IconiqLabCompaniesPresale.sol'
);
const TokenMold = artifacts.require('./TokenMold.sol');
const MintableToken = artifacts.require('./MintableToken.sol');
const Whitelist = artifacts.require('./Whitelist.sol');

const { should, ensuresException, getBlockNow } = require('./helpers/utils');
const expect = require('chai').expect;
const timer = require('./helpers/timer');

const BigNumber = web3.BigNumber;

contract(
    'IconiqLabCompaniesPresale',
    ([owner, wallet, buyer, buyer2, user1]) => {
        const rate = new BigNumber(10);
        const newRate = new BigNumber(20);

        const dayInSecs = 86400;
        const value = new BigNumber(1e18);

        const totalTokensForCrowdsale = new BigNumber(20000000e18);

        let startTime, firstPhaseEnds, secondPhaseEnds, thirdPhaseEnds, endTime;
        let crowdsale, token, icnq, whitelist;

        const newCrowdsale = rate => {
            startTime = getBlockNow() + 2; // crowdsale starts in 2 seconds
            firstPhaseEnds = startTime + dayInSecs * 10; // 10 days
            secondPhaseEnds = startTime + dayInSecs * 30; // 30 days
            thirdPhaseEnds = startTime + dayInSecs * 50; // 50 days
            endTime = startTime + dayInSecs * 70; // 70 days

            return Whitelist.new()
                .then(whitelistRegistry => {
                    whitelist = whitelistRegistry;
                    return MintableToken.new();
                })
                .then(mintableToken => {
                    icnq = mintableToken;
                    return TokenMold.new('Example Token', 'EXT', 18);
                })
                .then(tokenMold => {
                    token = tokenMold;
                    return IconiqLabCompaniesPresale.new(
                        startTime,
                        firstPhaseEnds,
                        secondPhaseEnds,
                        thirdPhaseEnds,
                        endTime,
                        whitelist.address,
                        icnq.address,
                        token.address,
                        rate,
                        wallet,
                        totalTokensForCrowdsale
                    );
                });
        };

        beforeEach('initialize contract', async () => {
            crowdsale = await newCrowdsale(rate);
        });

        it('has a normal crowdsale rate', async () => {
            const crowdsaleRate = await crowdsale.rate();
            crowdsaleRate.toNumber().should.equal(rate.toNumber());
        });

        it('has a whitelist contract', async () => {
            const whitelistContract = await crowdsale.whitelist();
            whitelistContract.should.equal(whitelist.address);
        });

        it('has a token contract', async () => {
            const tokenContract = await crowdsale.token();
            tokenContract.should.equal(token.address);
        });

        it('has a icnq contract', async () => {
            const icnqContract = await crowdsale.icnq();
            icnqContract.should.equal(icnq.address);
        });

        it('has a wallet', async () => {
            const walletAddress = await crowdsale.wallet();
            walletAddress.should.equal(wallet);
        });

        it('has a totalTokensForCrowdsale', async () => {
            const totalTokensForCrowdsaleFigure = await crowdsale.totalTokensForCrowdsale();
            totalTokensForCrowdsaleFigure.should.be.bignumber.equal(
                totalTokensForCrowdsale
            );
        });

        it('starts with token paused', async () => {
            const paused = await token.paused();
            paused.should.be.true;
        });

        describe('#mintTokenForPremiumICNQHolders', function() {
            beforeEach(async () => {
                const premiumHolderThreshhold = 100000e18;
                await whitelist.addManyToWhitelist([buyer, buyer2]);
                await token.transferOwnership(crowdsale.address);
                await icnq.mint(buyer, premiumHolderThreshhold);
            });

            it('must NOT be called by a non owner', async () => {
                try {
                    await crowdsale.mintTokenForPremiumICNQHolders(
                        buyer,
                        10e18,
                        {
                            from: buyer
                        }
                    );
                    assert.fail();
                } catch (e) {
                    ensuresException(e);
                }

                const buyerBalance = await token.balanceOf(buyer);
                buyerBalance.should.be.bignumber.equal(0);
            });

            it('must NOT allow non premium holders to participate', async () => {
                try {
                    await crowdsale.mintTokenForPremiumICNQHolders(
                        buyer2,
                        10e18,
                        {
                            from: owner
                        }
                    );
                    assert.fail();
                } catch (e) {
                    ensuresException(e);
                }

                const buyer2Balance = await token.balanceOf(buyer2);
                buyer2Balance.should.be.bignumber.equal(0);
            });

            it('should NOT mint tokens when premiun holders cap is reached', async () => {
                const preCrowdsaleCap = await crowdsale.totalTokensForCrowdsale();

                try {
                    await crowdsale.mintTokenForPremiumICNQHolders(
                        buyer,
                        preCrowdsaleCap.toNumber() + 10e18
                    );
                    assert.fail();
                } catch (e) {
                    ensuresException(e);
                }

                const buyerBalance = await token.balanceOf(buyer);
                buyerBalance.should.be.bignumber.equal(0);
            });

            it('should NOT mint tokens for premiun holders after first phase of token sale ends', async () => {
                await timer(dayInSecs * 50);

                try {
                    await crowdsale.mintTokenForPremiumICNQHolders(
                        buyer,
                        value
                    );
                    assert.fail();
                } catch (e) {
                    ensuresException(e);
                }

                const buyerBalance = await token.balanceOf(buyer);
                buyerBalance.should.be.bignumber.equal(0);
            });

            it('mints tokens to premiun holders before the crowdsale starts', async () => {
                const { logs } = await crowdsale.mintTokenForPremiumICNQHolders(
                    buyer,
                    value
                );

                const buyerBalance = await token.balanceOf(buyer);
                buyerBalance.should.be.bignumber.equal(value);

                const event = logs.find(
                    e => e.event === 'PremiunICNQHolderTokenPurchase'
                );
                should.exist(event);
            });
        });

        describe('changing rate', () => {
            it('does NOT allows anyone to change rate other than the owner', async () => {
                try {
                    await crowdsale.setRate(newRate, { from: buyer });
                    assert.fail();
                } catch (e) {
                    ensuresException(e);
                }

                const rate = await crowdsale.rate();
                rate.should.be.bignumber.equal(rate);
            });

            it('cannot set a rate that is zero', async () => {
                const zeroRate = new BigNumber(0);

                try {
                    await crowdsale.setRate(zeroRate, { from: owner });
                    assert.fail();
                } catch (e) {
                    ensuresException(e);
                }

                const rate = await crowdsale.rate();
                rate.should.be.bignumber.equal(rate);
            });

            it('allows owner to change rate', async () => {
                const { logs } = await crowdsale.setRate(newRate, {
                    from: owner
                });

                const event = logs.find(e => e.event === 'TokenRateChanged');
                should.exist(event);

                const rate = await crowdsale.rate();
                rate.should.be.bignumber.equal(newRate);
            });
        });

        describe('whitelist', () => {
            it('only allows owner to add to the whitelist', async () => {
                await timer(dayInSecs);

                try {
                    await whitelist.addManyToWhitelist([buyer, buyer2], {
                        from: buyer
                    });
                    assert.fail();
                } catch (e) {
                    ensuresException(e);
                }

                let isBuyerWhitelisted = await whitelist.isWhitelisted.call(
                    buyer
                );
                isBuyerWhitelisted.should.be.false;

                await whitelist.addManyToWhitelist([buyer, buyer2], {
                    from: owner
                });

                isBuyerWhitelisted = await whitelist.isWhitelisted.call(buyer);
                isBuyerWhitelisted.should.be.true;
            });

            it('only allows owner to remove from the whitelist', async () => {
                await timer(dayInSecs);
                await whitelist.addManyToWhitelist([buyer, buyer2], {
                    from: owner
                });

                try {
                    await whitelist.removeFromWhitelist([buyer], {
                        from: buyer2
                    });
                    assert.fail();
                } catch (e) {
                    ensuresException(e);
                }

                let isBuyerWhitelisted = await whitelist.isWhitelisted.call(
                    buyer2
                );
                isBuyerWhitelisted.should.be.true;

                await whitelist.removeFromWhitelist([buyer], { from: owner });

                isBuyerWhitelisted = await whitelist.isWhitelisted.call(buyer);
                isBuyerWhitelisted.should.be.false;
            });

            it('shows whitelist addresses', async () => {
                await timer(dayInSecs);
                await whitelist.addManyToWhitelist([buyer, buyer2], {
                    from: owner
                });

                const isBuyerWhitelisted = await whitelist.isWhitelisted.call(
                    buyer
                );
                const isBuyer2Whitelisted = await whitelist.isWhitelisted.call(
                    buyer2
                );

                isBuyerWhitelisted.should.be.true;
                isBuyer2Whitelisted.should.be.true;
            });

            it('has WhitelistUpdated event', async () => {
                await timer(dayInSecs);
                const { logs } = await whitelist.addManyToWhitelist(
                    [buyer, buyer2],
                    {
                        from: owner
                    }
                );

                const event = logs.find(e => e.event === 'WhitelistUpdated');
                expect(event).to.exist;
            });
        });

        describe('token purchases', () => {
            beforeEach('initialize contract', async () => {
                await whitelist.addManyToWhitelist([buyer, buyer2]);
                await token.transferOwnership(crowdsale.address);
                await icnq.mint(buyer, 10e18);
                await icnq.mint(buyer2, 10e18);
            });

            it('allows ONLY whitelisted addresses to purchase tokens', async () => {
                await timer(dayInSecs * 52);

                try {
                    await crowdsale.buyTokens(user1, { from: user1 });
                    assert.fail();
                } catch (e) {
                    ensuresException(e);
                }

                const userBalance = await token.balanceOf(user1);
                userBalance.should.be.bignumber.equal(0);

                // purchase occurrence
                await crowdsale.buyTokens(buyer, { value, from: buyer });

                const buyerBalance = await token.balanceOf(buyer);
                buyerBalance.should.be.bignumber.equal(10e18);
            });

            it('allows ONLY addresses that call buyTokens to purchase tokens', async () => {
                await timer(dayInSecs * 52);

                try {
                    await crowdsale.buyTokens(buyer, { from: owner });
                    assert.fail();
                } catch (e) {
                    ensuresException(e);
                }

                try {
                    await crowdsale.sendTransaction({ from: owner });
                    assert.fail();
                } catch (e) {
                    ensuresException(e);
                }

                const userBalance = await token.balanceOf(user1);
                userBalance.should.be.bignumber.equal(0);

                // puchase occurence
                await crowdsale.buyTokens(buyer, { value, from: buyer });

                const buyerBalance = await token.balanceOf(buyer);
                buyerBalance.should.be.bignumber.equal(10e18);
            });

            it('does NOT buy tokens when crowdsale is paused', async () => {
                await timer(dayInSecs * 52);
                await crowdsale.pause();
                let buyerBalance;

                try {
                    await crowdsale.buyTokens(buyer, { value, from: buyer });
                    assert.fail();
                } catch (e) {
                    ensuresException(e);
                }

                buyerBalance = await token.balanceOf(buyer);
                buyerBalance.should.be.bignumber.equal(0);

                await crowdsale.unpause();
                await crowdsale.buyTokens(buyer, { value, from: buyer });

                buyerBalance = await token.balanceOf(buyer);
                buyerBalance.should.be.bignumber.equal(10e18);
            });

            it('only mints tokens up to crowdsale cap', async () => {
                crowdsale = await newCrowdsale(20000000);
                await whitelist.addManyToWhitelist([buyer]);
                await token.transferOwnership(crowdsale.address);

                await timer(dayInSecs * 64);

                await crowdsale.buyTokens(buyer, {
                    from: buyer,
                    value
                });

                const buyerBalance = await token.balanceOf(buyer);
                buyerBalance.should.be.bignumber.equal(totalTokensForCrowdsale);

                try {
                    await crowdsale.buyTokens(buyer, { value, from: buyer });
                    assert.fail();
                } catch (e) {
                    ensuresException(e);
                }

                const hasEnded = await crowdsale.hasEnded();
                hasEnded.should.be.true;
            });

            it('does NOT allow purchase when token ownership does not currently belong to crowdsale contract', async () => {
                crowdsale = await newCrowdsale(rate);
                await whitelist.addManyToWhitelist([buyer]);

                timer(dayInSecs * 64);

                try {
                    await crowdsale.buyTokens(buyer, {
                        value: 2e18,
                        from: buyer
                    });
                    assert.fail();
                } catch (e) {
                    ensuresException(e);
                }

                const buyerBalance = await token.balanceOf(buyer);
                buyerBalance.should.be.bignumber.equal(0);
            });

            it('does not allow purchase when buyer goes over personal crowdsale cap during the second crowdsale phase', async () => {
                crowdsale = await newCrowdsale(10000000e18);
                await whitelist.addManyToWhitelist([buyer]);
                await token.transferOwnership(crowdsale.address);

                await icnq.mint(buyer, 10e18);
                await icnq.mint(buyer2, 10e18);

                timer(dayInSecs * 22);

                try {
                    await crowdsale.buyTokens(buyer, {
                        value: 2e18,
                        from: buyer
                    });
                    assert.fail();
                } catch (e) {
                    ensuresException(e);
                }

                const buyerBalance = await token.balanceOf(buyer);
                buyerBalance.should.be.bignumber.equal(0);
            });

            it('accepts purchase when it is within beneficiary cap during the second phase', async () => {
                crowdsale = await newCrowdsale(10000000);
                await whitelist.addManyToWhitelist([buyer, buyer2]);
                await token.transferOwnership(crowdsale.address);

                await icnq.mint(buyer, 10e18);
                await icnq.mint(buyer2, 10e18);

                await timer(dayInSecs * 19);

                await crowdsale.buyTokens(buyer, { value, from: buyer });
                await crowdsale.buyTokens(buyer2, { value, from: buyer2 });

                try {
                    await crowdsale.buyTokens(buyer2, { value, from: buyer2 });
                    assert.fail(); // it cannot buy more than totalTokensForCrowdsale
                } catch (error) {
                    ensuresException(error);
                }

                const buyerBalance = await token.balanceOf(buyer);
                const buyer2Balance = await token.balanceOf(buyer2);

                buyerBalance.should.be.bignumber.equal(
                    totalTokensForCrowdsale.div(2)
                ); // each receive 50% of all tokens
                buyer2Balance.should.be.bignumber.equal(
                    totalTokensForCrowdsale.div(2)
                ); // each receive 50% of all tokens
            });

            it('accepts purchase for percentage cap during the second phase', async () => {
                const onePercentOfTokenTotalSupply = totalTokensForCrowdsale.div(
                    100e18
                );

                crowdsale = await newCrowdsale(onePercentOfTokenTotalSupply);
                await whitelist.addManyToWhitelist([buyer, buyer2]);
                await token.transferOwnership(crowdsale.address);

                await icnq.mint(buyer, 99e18);
                await icnq.mint(buyer2, 1e18); // possesses 1% of icnq tokens

                await timer(dayInSecs * 19);

                await crowdsale.buyTokens(buyer2, { value, from: buyer2 });

                try {
                    await crowdsale.buyTokens(buyer2, { value, from: buyer2 });
                    assert.fail(); // it cannot buy more than 1% personal cap
                } catch (error) {
                    ensuresException(error);
                }

                const buyer2Balance = await token.balanceOf(buyer2);

                buyer2Balance.should.be.bignumber.equal(
                    onePercentOfTokenTotalSupply.mul(1e18)
                );
            });

            it('accepts purchase for less than 1 percent personal cap during the second phase', async () => {
                const halfPercentOfTokenTotalSupply = totalTokensForCrowdsale
                    .div(2)
                    .div(100e18);

                console.log({ halfPercentOfTokenTotalSupply });
                crowdsale = await newCrowdsale(halfPercentOfTokenTotalSupply);
                await whitelist.addManyToWhitelist([buyer, buyer2]);
                await token.transferOwnership(crowdsale.address);

                await icnq.mint(buyer, 99e18 + 1e18 / 2);
                await icnq.mint(buyer2, 1e18 / 2); // possesses 0.5% of icnq tokens

                await timer(dayInSecs * 19);

                await crowdsale.buyTokens(buyer2, { value, from: buyer2 });

                try {
                    await crowdsale.buyTokens(buyer2, { value, from: buyer2 });
                    assert.fail(); // it cannot buy more than 0.5% personal cap
                } catch (error) {
                    ensuresException(error);
                }

                const buyer2Balance = await token.balanceOf(buyer2);

                buyer2Balance.should.be.bignumber.equal(
                    halfPercentOfTokenTotalSupply.mul(1e18)
                );
            });

            it('allows purchases only for icnq holders during third phase', async () => {
                await timer(dayInSecs * 32);
                await whitelist.addManyToWhitelist([user1]);

                try {
                    await crowdsale.buyTokens(user1, {
                        value,
                        from: user1
                    });
                    assert.fail();
                } catch (e) {
                    ensuresException(e);
                }

                const user1Balance = await token.balanceOf(user1);
                user1Balance.should.be.bignumber.equal(0);

                await crowdsale.buyTokens(buyer, {
                    value,
                    from: buyer
                });

                const buyerBalance = await token.balanceOf(buyer);
                buyerBalance.should.be.bignumber.equal(10e18);
            });

            it('allows purchases normally after third phase ends', async () => {
                await timer(dayInSecs * 68);

                await whitelist.addManyToWhitelist([user1]);

                await crowdsale.buyTokens(user1, {
                    value,
                    from: user1
                });

                const user1Balance = await token.balanceOf(user1);
                user1Balance.should.be.bignumber.equal(10e18);
            });
        });

        describe('crowdsale finalization', function() {
            beforeEach(async () => {
                await whitelist.addManyToWhitelist([buyer]);

                await token.transferOwnership(crowdsale.address);

                await timer(dayInSecs * 62);
                await crowdsale.buyTokens(buyer, { value, from: buyer });
                await timer(dayInSecs * 20);

                await crowdsale.finalize();
            });

            it('shows that crowdsale is finalized', async function() {
                const isCrowdsaleFinalized = await crowdsale.isFinalized();
                isCrowdsaleFinalized.should.be.true;
            });

            it('returns token ownership to original owner', async function() {
                const tokenOwner = await token.owner();
                tokenOwner.should.be.equal(owner);
            });
        });
    }
);
