// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title Zillopoly
 * @dev Real estate guessing game with three stages:
 * Stage 1: Initialize game with listing (displayed price shown)
 * Stage 2: Player guesses if actual price is higher or lower than displayed price
 * Stage 3: External oracle sets actual price and bet is settled
 */
contract Zillopoly is Ownable, ReentrancyGuard {
    IERC20 public hoboToken;

    uint256 public constant GAME_COST = 1000 * 10**18; // 1000 HOBO tokens
    uint256 public constant BATCH_SIZE = 10; // Number of games per batch
    uint256 public constant BATCH_COST = GAME_COST * BATCH_SIZE; // 10,000 HOBO tokens
    uint256 public nextGameId = 1;

    enum GameStage {
        NotStarted,
        Initialized,    // Stage 1: Listing created with displayed price
        GuessSubmitted, // Stage 2: Player has made their guess
        Settled         // Stage 3: Bet settled with actual price
    }

    struct Listing {
        uint256 gameId;           // Unique auto-incremented game ID
        uint256 displayedPrice;   // Price shown to player (set at initialization)
        uint256 actualPrice;      // Real price (set at settlement by oracle)
        bool higherOrLower;       // Player's guess: true = higher, false = lower
        bytes32 listingId;        // Unique listing identifier
        address player;           // Player who owns this game
        uint256 timestamp;        // When game was created
        GameStage stage;          // Current stage of the game
        bool won;                 // Whether player won (set after settlement)
        uint256 payout;           // Payout amount (set after settlement)
    }

    // Mapping from player address to their listings
    mapping(address => Listing[]) public playerListings;

    // Mapping from gameId to listing (for easy lookup)
    mapping(uint256 => Listing) public gameById;

    // All games ever created
    Listing[] public allGames;

    event BatchGamesCreated(
        address indexed player,
        uint256 startGameId,
        uint256 endGameId,
        uint256 timestamp
    );

    event GameInitialized(
        uint256 indexed gameId,
        address indexed player,
        bytes32 indexed listingId,
        uint256 displayedPrice,
        uint256 timestamp
    );

    event GuessMade(
        uint256 indexed gameId,
        address indexed player,
        bool higherOrLower
    );

    event BetSettled(
        uint256 indexed gameId,
        address indexed player,
        uint256 displayedPrice,
        uint256 actualPrice,
        bool higherOrLower,
        bool won,
        uint256 payout
    );

    constructor(address _hoboToken) Ownable(msg.sender) {
        hoboToken = IERC20(_hoboToken);
    }

    /**
     * @dev Create batch of 10 empty games
     * Player deposits 10,000 HOBO and receives 10 game slots
     * CRE will initialize these games with listing data
     */
    function startGame() external nonReentrant returns (uint256, uint256) {
        // Transfer 10,000 HOBO from player
        require(
            hoboToken.transferFrom(msg.sender, address(this), BATCH_COST),
            "Transfer failed"
        );

        uint256 startGameId = nextGameId;

        // Create 10 empty game slots
        for (uint256 i = 0; i < BATCH_SIZE; i++) {
            Listing memory newListing = Listing({
                gameId: nextGameId,
                displayedPrice: 0,           // Will be set by CRE
                actualPrice: 0,
                higherOrLower: false,
                listingId: bytes32(0),       // Will be set by CRE
                player: msg.sender,
                timestamp: block.timestamp,
                stage: GameStage.NotStarted,
                won: false,
                payout: 0
            });

            // Store the listing
            playerListings[msg.sender].push(newListing);
            gameById[nextGameId] = newListing;
            allGames.push(newListing);

            nextGameId++;
        }

        uint256 endGameId = nextGameId - 1;

        emit BatchGamesCreated(msg.sender, startGameId, endGameId, block.timestamp);

        return (startGameId, endGameId);
    }

    /**
     * @dev Initialize a game with listing data (called by owner/CRE)
     * @param gameId The game ID to initialize
     * @param listingId Unique identifier for the listing
     * @param displayedPrice The price shown to the player
     */
    function initializeGame(
        uint256 gameId,
        bytes32 listingId,
        uint256 displayedPrice
    ) external onlyOwner nonReentrant {
        require(gameId > 0 && gameId < nextGameId, "Invalid game ID");
        require(listingId != bytes32(0), "Invalid listing ID");
        require(displayedPrice > 0, "Displayed price must be > 0");

        Listing storage game = gameById[gameId];
        require(game.stage == GameStage.NotStarted, "Game already initialized");

        // Set listing data
        game.listingId = listingId;
        game.displayedPrice = displayedPrice;
        game.stage = GameStage.Initialized;

        // Update in all storage locations
        _updateListingInArrays(gameId, game);

        emit GameInitialized(gameId, game.player, listingId, displayedPrice, block.timestamp);
    }

    /**
     * @dev STAGE 2: Player makes their guess
     * @param gameId The game ID
     * @param isHigher True if player thinks actual price is higher, false if lower
     */
    function makeGuess(uint256 gameId, bool isHigher) external nonReentrant {
        require(gameId > 0 && gameId < nextGameId, "Invalid game ID");

        Listing storage game = gameById[gameId];
        require(game.player == msg.sender, "Not your game");
        require(game.stage == GameStage.Initialized, "Game not in guess stage");

        // Set the player's guess
        game.higherOrLower = isHigher;
        game.stage = GameStage.GuessSubmitted;

        // Update in all storage locations
        _updateListingInArrays(gameId, game);

        emit GuessMade(gameId, msg.sender, isHigher);
    }

    /**
     * @dev STAGE 3: Owner sets actual price and settles the bet
     * @param gameId The game ID
     * @param actualPrice The real price of the listing
     */
    function settleBet(uint256 gameId, uint256 actualPrice) external onlyOwner nonReentrant {
        require(gameId > 0 && gameId < nextGameId, "Invalid game ID");
        require(actualPrice > 0, "Actual price must be > 0");

        Listing storage game = gameById[gameId];
        require(game.stage == GameStage.GuessSubmitted, "Game not ready for settlement");

        game.actualPrice = actualPrice;

        // Determine if player won
        bool playerWon = false;
        if (game.higherOrLower && actualPrice > game.displayedPrice) {
            // Guessed higher and actual is higher
            playerWon = true;
        } else if (!game.higherOrLower && actualPrice < game.displayedPrice) {
            // Guessed lower and actual is lower
            playerWon = true;
        } else if (actualPrice == game.displayedPrice) {
            // Edge case: prices are equal, player wins
            playerWon = true;
        }

        game.won = playerWon;
        game.stage = GameStage.Settled;

        // Calculate payout
        if (playerWon) {
            // Player wins 2x their bet
            game.payout = GAME_COST * 2;
            require(hoboToken.transfer(game.player, game.payout), "Payout failed");
        } else {
            // Player loses, bet stays in contract
            game.payout = 0;
        }

        // Update in all storage locations
        _updateListingInArrays(gameId, game);

        emit BetSettled(
            gameId,
            game.player,
            game.displayedPrice,
            actualPrice,
            game.higherOrLower,
            playerWon,
            game.payout
        );
    }

    /**
     * @dev Update listing in all storage arrays
     * @param gameId The game ID
     * @param updatedGame The updated game data
     */
    function _updateListingInArrays(uint256 gameId, Listing storage updatedGame) private {
        // Update in player listings
        Listing[] storage playerGames = playerListings[updatedGame.player];
        for (uint256 i = 0; i < playerGames.length; i++) {
            if (playerGames[i].gameId == gameId) {
                playerGames[i] = updatedGame;
                break;
            }
        }

        // Update in all games
        for (uint256 i = 0; i < allGames.length; i++) {
            if (allGames[i].gameId == gameId) {
                allGames[i] = updatedGame;
                break;
            }
        }
    }

    /**
     * @dev Get all listings for a specific player
     * @param player Address of the player
     */
    function getPlayerListings(address player) external view returns (Listing[] memory) {
        return playerListings[player];
    }

    /**
     * @dev Get a specific game by ID
     * @param gameId The game ID
     */
    function getGame(uint256 gameId) external view returns (Listing memory) {
        require(gameId > 0 && gameId < nextGameId, "Invalid game ID");
        return gameById[gameId];
    }

    /**
     * @dev Get total number of games created
     */
    function getTotalGames() external view returns (uint256) {
        return allGames.length;
    }

    /**
     * @dev Get number of games in specific stage for a player
     * @param player Address of the player
     * @param stage The game stage to filter by
     */
    function getPlayerGamesByStage(address player, GameStage stage) external view returns (uint256) {
        uint256 count = 0;
        Listing[] memory listings = playerListings[player];

        for (uint256 i = 0; i < listings.length; i++) {
            if (listings[i].stage == stage) {
                count++;
            }
        }

        return count;
    }

    /**
     * @dev Owner can withdraw accumulated HOBO tokens
     * @param amount Amount to withdraw
     */
    function withdrawFunds(uint256 amount) external onlyOwner {
        require(amount <= hoboToken.balanceOf(address(this)), "Insufficient balance");
        require(hoboToken.transfer(msg.sender, amount), "Transfer failed");
    }

    /**
     * @dev Get contract's HOBO balance
     */
    function getContractBalance() external view returns (uint256) {
        return hoboToken.balanceOf(address(this));
    }
}
