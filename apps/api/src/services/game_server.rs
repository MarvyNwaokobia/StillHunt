use std::collections::{HashMap, VecDeque};
use std::time::{Duration, Instant};
use tokio::sync::mpsc::{self, UnboundedSender};
use uuid::Uuid;
use serde_json::json;
use rand::Rng;
use sqlx::PgPool;

// ── Public handle — cheaply cloneable, passed into AppState ──────────────────

#[derive(Clone)]
pub struct GameServerHandle {
    pub tx: UnboundedSender<ServerMsg>,
}

impl GameServerHandle {
    pub fn spawn(db: PgPool) -> Self {
        let (tx, rx) = mpsc::unbounded_channel();
        let self_tx  = tx.clone();
        tokio::spawn(GameServer::new(db).run(rx, self_tx));
        Self { tx }
    }
}

// ── Messages flowing into the game server task ────────────────────────────────

pub struct ClientEntry {
    pub wallet:       String,
    pub name:         String,
    pub player_class: String,
    pub attack:       i32,
    pub defense:      i32,
    pub speed:        i32,
    pub tx:           UnboundedSender<String>,
}

pub enum ServerMsg {
    Join(ClientEntry),
    Action  { wallet: String, room_id: String, action: String },
    Leave   { wallet: String },
    Timeout { room_id: String },
}

// ── Internal state ────────────────────────────────────────────────────────────

struct PlayerState {
    wallet:       String,
    name:         String,
    player_class: String,
    hp:           i32,
    attack:       i32,
    defense:      i32,
    speed:        i32,
    tx:           UnboundedSender<String>,
    last_attack:  Option<Instant>,
    last_block:   Option<Instant>,
    last_special: Option<Instant>,
}

struct GameRoom {
    id:      String,
    p1:      PlayerState,
    p2:      PlayerState,
    started: Instant,
    active:  bool,
}

struct GameServer {
    queue:        VecDeque<ClientEntry>,
    rooms:        HashMap<String, GameRoom>,
    player_rooms: HashMap<String, String>,
    db:           PgPool,
}

impl GameServer {
    fn new(db: PgPool) -> Self {
        Self {
            queue:        VecDeque::new(),
            rooms:        HashMap::new(),
            player_rooms: HashMap::new(),
            db,
        }
    }

    async fn run(
        mut self,
        mut rx:     mpsc::UnboundedReceiver<ServerMsg>,
        self_tx:    UnboundedSender<ServerMsg>,
    ) {
        while let Some(msg) = rx.recv().await {
            self.handle(msg, &self_tx);
        }
    }

    fn handle(&mut self, msg: ServerMsg, self_tx: &UnboundedSender<ServerMsg>) {
        match msg {
            ServerMsg::Join(entry)                    => self.on_join(entry, self_tx),
            ServerMsg::Action { wallet, room_id, action } => {
                if wallet == "__system__" && action == "__fight_start__" {
                    self.fight_start(&room_id);
                } else {
                    self.on_action(&wallet, &room_id, &action);
                }
            }
            ServerMsg::Leave { wallet }               => self.on_leave(&wallet),
            ServerMsg::Timeout { room_id }            => self.on_timeout(&room_id),
        }
    }

    // ── Join / matchmaking ────────────────────────────────────────────────────

    fn on_join(&mut self, entry: ClientEntry, self_tx: &UnboundedSender<ServerMsg>) {
        let pos = self.queue.len() + 1;
        send(&entry.tx, json!({ "type": "queued", "position": pos }));
        self.queue.push_back(entry);

        if self.queue.len() >= 2 {
            let e1 = self.queue.pop_front().unwrap();
            let e2 = self.queue.pop_front().unwrap();
            self.create_room(e1, e2, self_tx);
        }
    }

    fn create_room(
        &mut self,
        e1: ClientEntry,
        e2: ClientEntry,
        self_tx: &UnboundedSender<ServerMsg>,
    ) {
        let room_id = Uuid::new_v4().to_string();

        send(&e1.tx, json!({
            "type":      "match_found",
            "room_id":   room_id,
            "opponent":  { "wallet": e2.wallet, "name": e2.name, "class": e2.player_class },
            "countdown": 3
        }));
        send(&e2.tx, json!({
            "type":      "match_found",
            "room_id":   room_id,
            "opponent":  { "wallet": e1.wallet, "name": e1.name, "class": e1.player_class },
            "countdown": 3
        }));

        self.player_rooms.insert(e1.wallet.clone(), room_id.clone());
        self.player_rooms.insert(e2.wallet.clone(), room_id.clone());
        self.rooms.insert(room_id.clone(), GameRoom {
            id: room_id.clone(),
            p1: PlayerState {
                wallet: e1.wallet, name: e1.name, player_class: e1.player_class,
                hp: 100, attack: e1.attack, defense: e1.defense, speed: e1.speed,
                tx: e1.tx,
                last_attack: None, last_block: None, last_special: None,
            },
            p2: PlayerState {
                wallet: e2.wallet, name: e2.name, player_class: e2.player_class,
                hp: 100, attack: e2.attack, defense: e2.defense, speed: e2.speed,
                tx: e2.tx,
                last_attack: None, last_block: None, last_special: None,
            },
            started: Instant::now(),
            active: false,
        });

        // Spawn timers: 3-second fight_start, then 60-second timeout
        let stx   = self_tx.clone();
        let rid   = room_id.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_secs(3)).await;
            let _ = stx.send(ServerMsg::Action {
                wallet:  "__system__".into(),
                room_id: rid.clone(),
                action:  "__fight_start__".into(),
            });
            tokio::time::sleep(Duration::from_secs(60)).await;
            let _ = stx.send(ServerMsg::Timeout { room_id: rid });
        });
    }

    fn fight_start(&mut self, room_id: &str) {
        if let Some(room) = self.rooms.get_mut(room_id) {
            room.active  = true;
            room.started = Instant::now();
            let msg = json!({ "type": "fight_start" }).to_string();
            let _ = room.p1.tx.send(msg.clone());
            let _ = room.p2.tx.send(msg);
        }
    }

    // ── Actions ───────────────────────────────────────────────────────────────

    fn on_action(&mut self, wallet: &str, room_id: &str, action: &str) {
        let room = match self.rooms.get_mut(room_id) {
            Some(r) if r.active => r,
            _ => return,
        };

        let is_p1 = room.p1.wallet == wallet;
        let now   = Instant::now();

        // Cooldown enforcement
        {
            let p = if is_p1 { &mut room.p1 } else { &mut room.p2 };
            match action {
                "attack" => {
                    if p.last_attack.map_or(false, |t| now.duration_since(t) < Duration::from_millis(1400)) {
                        return;
                    }
                    p.last_attack = Some(now);
                }
                "block" => {
                    if p.last_block.map_or(false, |t| now.duration_since(t) < Duration::from_millis(1900)) {
                        return;
                    }
                    p.last_block = Some(now);
                }
                "special" => {
                    if p.last_special.map_or(false, |t| now.duration_since(t) < Duration::from_millis(7900)) {
                        return;
                    }
                    p.last_special = Some(now);
                }
                _ => return,
            }
        }

        // Is defender currently blocking?
        let defender_blocking = {
            let d = if is_p1 { &room.p2 } else { &room.p1 };
            d.last_block.map_or(false, |t| now.duration_since(t) < Duration::from_millis(2000))
        };

        // Damage
        let (atk, def_stat) = {
            let a = if is_p1 { &room.p1 } else { &room.p2 };
            let d = if is_p1 { &room.p2 } else { &room.p1 };
            (a.attack, d.defense)
        };

        let (damage, was_blocked) = match action {
            "attack" => {
                let base = rand_dmg(atk as f32 * 0.6, 8.0);
                if defender_blocking {
                    (i32::max(0, base - def_stat / 2), true)
                } else {
                    (i32::max(1, base - def_stat / 5), false)
                }
            }
            "special" => (i32::max(5, rand_dmg(atk as f32 * 1.8, 12.0)), false),
            _         => (0, false),
        };

        // Apply HP
        if damage > 0 {
            let def = if is_p1 { &mut room.p2 } else { &mut room.p1 };
            def.hp = i32::max(0, def.hp - damage);
        }

        let p1_hp   = room.p1.hp;
        let p2_hp   = room.p2.hp;
        let game_over = p1_hp <= 0 || p2_hp <= 0;
        if game_over { room.active = false; }

        // Broadcast
        let p1_msg = json!({
            "type": "action_result",
            "attacker":    if is_p1 { "player" } else { "opponent" },
            "action":      action,
            "was_blocked": was_blocked,
            "damage":      damage,
            "player_hp":   p1_hp,
            "opponent_hp": p2_hp,
        }).to_string();
        let p2_msg = json!({
            "type": "action_result",
            "attacker":    if is_p1 { "opponent" } else { "player" },
            "action":      action,
            "was_blocked": was_blocked,
            "damage":      damage,
            "player_hp":   p2_hp,
            "opponent_hp": p1_hp,
        }).to_string();
        let _ = room.p1.tx.send(p1_msg);
        let _ = room.p2.tx.send(p2_msg);

        if game_over {
            let p1_won = p2_hp <= 0;
            let rid = room_id.to_string();
            self.end_room(&rid, p1_won, "hp_zero");
        }
    }

    // ── Timeout ───────────────────────────────────────────────────────────────

    fn on_timeout(&mut self, room_id: &str) {
        let (p1_won, active) = match self.rooms.get(room_id) {
            Some(r) => (r.p1.hp >= r.p2.hp, r.active),
            None => return,
        };
        if !active { return; }
        let rid = room_id.to_string();
        self.end_room(&rid, p1_won, "timeout");
    }

    // ── Disconnect ────────────────────────────────────────────────────────────

    fn on_leave(&mut self, wallet: &str) {
        let room_id = match self.player_rooms.get(wallet) {
            Some(id) => id.clone(),
            None => {
                self.queue.retain(|e| e.wallet != wallet);
                return;
            }
        };

        let other_tx = match self.rooms.get(&room_id) {
            Some(r) if r.active => {
                if r.p1.wallet == wallet { r.p2.tx.clone() } else { r.p1.tx.clone() }
            }
            _ => return,
        };

        send(&other_tx, json!({ "type": "opponent_disconnected" }));
        self.rooms.remove(&room_id);
        self.player_rooms.remove(wallet);
    }

    // ── End-room ──────────────────────────────────────────────────────────────

    fn end_room(&mut self, room_id: &str, p1_won: bool, reason: &str) {
        let room = match self.rooms.remove(room_id) {
            Some(r) => r,
            None => return,
        };
        self.player_rooms.remove(&room.p1.wallet);
        self.player_rooms.remove(&room.p2.wallet);

        const XP_WIN: i32  = 100;
        const XP_LOSS: i32 = 30;

        let mk = |won: bool| json!({
            "type":      "match_end",
            "winner":    if won { "player" } else { "opponent" },
            "reason":    reason,
            "xp_earned": if won { XP_WIN } else { XP_LOSS },
            "g_earned":  0,
        }).to_string();

        let _ = room.p1.tx.send(mk(p1_won));
        let _ = room.p2.tx.send(mk(!p1_won));

        // Persist result asynchronously — does not block the game loop
        let db            = self.db.clone();
        let p1_wallet     = room.p1.wallet.clone();
        let p2_wallet     = room.p2.wallet.clone();
        let winner_wallet = if p1_won { room.p1.wallet.clone() } else { room.p2.wallet.clone() };
        let xp_p1 = if p1_won { XP_WIN } else { XP_LOSS };
        let xp_p2 = if p1_won { XP_LOSS } else { XP_WIN };

        tokio::spawn(async move {
            let now       = chrono::Utc::now();
            let battle_id = Uuid::new_v4();

            let _ = sqlx::query(
                "INSERT INTO battles
                   (id, challenger_wallet, opponent_wallet, winner_wallet,
                    rounds_data, xp_awarded_challenger, xp_awarded_opponent, is_bot, created_at)
                 VALUES ($1, $2, $3, $4, '[]', $5, $6, false, $7)",
            )
            .bind(battle_id)
            .bind(&p1_wallet)
            .bind(&p2_wallet)
            .bind(&winner_wallet)
            .bind(xp_p1)
            .bind(xp_p2)
            .bind(now)
            .execute(&db)
            .await;

            // Update XP + wins/losses for both players
            let _ = sqlx::query(
                "UPDATE players
                 SET xp      = xp + $1,
                     wins    = wins + $2,
                     losses  = losses + $3,
                     last_active  = $4,
                     decay_status = 'none'
                 WHERE wallet_address = $5",
            )
            .bind(xp_p1)
            .bind(if p1_won { 1_i32 } else { 0_i32 })
            .bind(if p1_won { 0_i32 } else { 1_i32 })
            .bind(now)
            .bind(&p1_wallet)
            .execute(&db)
            .await;

            let _ = sqlx::query(
                "UPDATE players
                 SET xp      = xp + $1,
                     wins    = wins + $2,
                     losses  = losses + $3,
                     last_active  = $4,
                     decay_status = 'none'
                 WHERE wallet_address = $5",
            )
            .bind(xp_p2)
            .bind(if p1_won { 0_i32 } else { 1_i32 })
            .bind(if p1_won { 1_i32 } else { 0_i32 })
            .bind(now)
            .bind(&p2_wallet)
            .execute(&db)
            .await;

            // Rank up if XP threshold crossed (1000 XP per rank)
            for wallet in [&p1_wallet, &p2_wallet] {
                let _ = sqlx::query(
                    "UPDATE players
                     SET rank = CASE
                       WHEN xp >= 4000 AND rank != 'Diamond'  THEN 'Diamond'
                       WHEN xp >= 3000 AND rank = 'Platinum'  THEN 'Diamond'
                       WHEN xp >= 2000 AND rank = 'Gold'      THEN 'Platinum'
                       WHEN xp >= 1000 AND rank = 'Silver'    THEN 'Gold'
                       WHEN xp >= 500  AND rank = 'Bronze'    THEN 'Silver'
                       ELSE rank
                     END
                     WHERE wallet_address = $1",
                )
                .bind(wallet)
                .execute(&db)
                .await;
            }
        });
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn send(tx: &UnboundedSender<String>, val: serde_json::Value) {
    let _ = tx.send(val.to_string());
}

fn rand_dmg(base: f32, variance: f32) -> i32 {
    let r: f32 = rand::rng().random_range(0.0..variance);
    (base + r) as i32
}
