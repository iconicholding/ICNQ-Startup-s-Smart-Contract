# Iconiq Lab Companies Presale Smart Contracts

## Table of Contents

* [Table of Contents](#table-of-contents)
* [Overview](#overview)
* [Implementation Details](#implementation-details)
* [Development](#development)

## Overview

The Iconiq Lab platform's smart contracts permits Iconiq Lab's incubators companies to create their token pre sale events.
This is primarily done via the ICNQ token. Firstly, it allows exclusive access to the presales (thus, the discounts and bonuses) of all companies which graduate the accelerator program. Only Ethereum addresses that hold the token is permitted to invest into the smart contracts of the companies Iconiq lab develops and promotes.

These presales are structured in 3 phases:
1- the first phase will be pro-rata based on your % holding of ICNQ (for example, if I hold 5% of ICNQ tokens, I can invest in 5% of the presale).

2- If this does not fulfill the entire presale, then the second phase will allow any ICNQ holder to invest as much as they wish.

3- If this goes unfulfilled, then the third phase will allow anybody to invest in the presale.

## Implementation Details

TokenMold.sol
This contract creates a token with customized name, symbol and decimals. Upon its creation, the token transfer functionality is paused, that is to say no one is able to trade them. This is possible to be reverted only by the token contract owner - who is the Ethereum address that deployed the token mold contract.
For this contract to work with TokenSale.sol, its ownership needs to be passed on to TokenSale contract instance that will manage the token sale.

Whitelist.sol
It allows the addition and/or removal of addresses to the whitelist registry. Both addition and removal of addresses is done via passing an array of Ethereum addresses to `addToWhitelist` and `removeFromWhitelist` functions within the contract. Only the contract owner has the ability to trigger such actions.

TokenSale.sol
This contract is where the fundraising occurs. For it to work as expected, the ownership from the deployed TokenMold contract needs to be passed on to TokenSale. This is accomplished via the `transferOwnership` function found in the zeppelin-solidity's Ownable.sol contract.

In order for investors to participate in the crowdsale using the TokenSale contract, they need firstly to hold ICNQ token. All in all, there are 3 time events where the token sale occurs via this smart contract. Please see [overview](#overview) for more info.

For a token purchase event to occur, investor must trigger the `BuyTokens` function within the TokenSale contract. Investors receives the purchased tokens right away, however, they will only be able to trade tokens once token transfers are unpaused. This is done by the token owner and should be most likely be done after the presale finishes or per incubators company decision.

In case there is a remainder amount of ETH left in the TokenSale contract (this may happen if the last purchaser participating in the crowdsale sends more ether than needed to finish the purchase of all left over tokens), then the remainder amount will be recorded on the public variable `remainderAmount`. This amount must be sent back to last purchaser. The last purchaser address is saved in the contract in the variable `remainderPurchaser`.

## Development

**Dependencies**

* `node@8.5.x`
* `truffle@^4.0.x`
* `ganache-cli@^6.0.x`
* `zeppelin-solidity@1.6.X`

## Setting Up

* Clone this repository.

* Install all [system dependencies](#development).

  * `cd truffle && npm install`

* Compile contract code

  * `node_modules/.bin/truffle compile`

## Running Tests

* `bash run_test.sh`

## License and Warranty

Be advised that while we strive to provide professional grade, tested code we cannot guarantee its fitness for your application. This is released under The MIT License (MIT) and as such we will not be held liable for lost funds, etc. Please use your best judgment and note the following:

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NON-INFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
