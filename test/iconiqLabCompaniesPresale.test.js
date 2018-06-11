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
        const value = new BigNumber(1);

        const totalTokensForCrowdsale = new BigNumber(20000000e18);

        let startTime, firstPhaseEnds, secondPhaseEnds, endTime;
        let crowdsale, token, icnq, whitelist;

        const newCrowdsale = rate => {
            startTime = getBlockNow() + 2; // crowdsale starts in 2 seconds
            firstPhaseEnds = startTime + dayInSecs * 30; // 30 days
            secondPhaseEnds = startTime + dayInSecs * 50; // 50 days
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

        it('has a totalTokensForCrowdsale variable', async () => {
            const totalTokensForCrowdsaleFigure = await crowdsale.totalTokensForCrowdsale();
            totalTokensForCrowdsaleFigure.should.be.bignumber.equal(
                totalTokensForCrowdsale
            );
        });

        it('starts with token paused', async () => {
            const paused = await token.paused();
            paused.should.be.true;
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
                    await whitelist.addToWhitelist([buyer, buyer2], {
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

                await whitelist.addToWhitelist([buyer, buyer2], {
                    from: owner
                });

                isBuyerWhitelisted = await whitelist.isWhitelisted.call(buyer);
                isBuyerWhitelisted.should.be.true;
            });

            it('only allows owner to remove from the whitelist', async () => {
                await timer(dayInSecs);
                await whitelist.addToWhitelist([buyer, buyer2], {
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
                await whitelist.addToWhitelist([buyer, buyer2], {
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
                const { logs } = await whitelist.addToWhitelist(
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
                await whitelist.addToWhitelist([buyer, buyer2]);
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
                buyerBalance.should.be.bignumber.equal(10);
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
                buyerBalance.should.be.bignumber.equal(10);
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
                buyerBalance.should.be.bignumber.equal(10);
            });

            it('only mints tokens up to crowdsale cap and when more eth is sent last user purchase info is saved in contract', async () => {
                crowdsale = await newCrowdsale(totalTokensForCrowdsale);
                await whitelist.addToWhitelist([buyer]);
                await token.transferOwnership(crowdsale.address);

                await timer(dayInSecs * 64);

                await crowdsale.buyTokens(buyer, { from: buyer, value: 2 });

                const buyerBalance = await token.balanceOf(buyer);
                buyerBalance.should.be.bignumber.equal(totalTokensForCrowdsale);

                const remainderPurchaser = await crowdsale.remainderPurchaser();
                remainderPurchaser.should.equal(buyer);

                const remainder = await crowdsale.remainderAmount();
                remainder.should.be.bignumber.equal(1);

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
                await whitelist.addToWhitelist([buyer]);

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

            it('does not allow purchase when buyer goes over personal crowdsale cap during the first crowdsale phase', async () => {
                crowdsale = await newCrowdsale(10000000e18);
                await whitelist.addToWhitelist([buyer]);
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

            it('accepts when it is within beneficiary cap for the first phase', async () => {
                crowdsale = await newCrowdsale(10000000e18);
                await whitelist.addToWhitelist([buyer, buyer2]);
                await token.transferOwnership(crowdsale.address);

                await icnq.mint(buyer, 10e18);
                await icnq.mint(buyer2, 10e18);

                await timer(dayInSecs * 19);

                await crowdsale.buyTokens(buyer, { value, from: buyer });
                await crowdsale.buyTokens(buyer2, { value, from: buyer2 });

                const buyerBalance = await token.balanceOf(buyer);
                const buyer2Balance = await token.balanceOf(buyer2);

                buyerBalance.should.be.bignumber.equal(10000000e18);
                buyer2Balance.should.be.bignumber.equal(10000000e18);
            });

            it('allows purchases only for icnq holders during secondPhaseEnds', async () => {
                await timer(dayInSecs * 32);
                await whitelist.addToWhitelist([user1]);

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
                buyerBalance.should.be.bignumber.equal(10);
            });

            it('allows purchases normally after secondPhaseEnds', async () => {
                await timer(dayInSecs * 68);

                await whitelist.addToWhitelist([user1]);

                await crowdsale.buyTokens(user1, {
                    value,
                    from: user1
                });

                const user1Balance = await token.balanceOf(user1);
                user1Balance.should.be.bignumber.equal(10);
            });
        });

        describe('crowdsale finalization', function() {
            beforeEach(async () => {
                await whitelist.addToWhitelist([buyer]);

                await token.transferOwnership(crowdsale.address);

                await timer(dayInSecs * 62);
                await crowdsale.buyTokens(buyer, { value, from: buyer });
                await timer(dayInSecs * 20);

                await crowdsale.finalize(owner);
            });

            it('shows that crowdsale is finalized', async function() {
                const isCrowdsaleFinalized = await crowdsale.isFinalized();
                isCrowdsaleFinalized.should.be.true;
            });

            it('returns token ownership to original owner', async function() {
                const tokenOwner = await token.owner();
                tokenOwner.should.be.equal(owner);
            });

            it('mints remaining crowdsale tokens to wallet', async function() {
                const buyerBalance = await token.balanceOf(buyer);

                const walletTokenBalance = await token.balanceOf(wallet);
                walletTokenBalance.should.be.bignumber.equal(
                    totalTokensForCrowdsale.sub(buyerBalance)
                );
            });
        });
    }
);
