use axum::{routing::get, Json, Router};
use serde_json::json;
use std::net::SocketAddr;
use tokio::signal;

#[tokio::main]
async fn main() {
    let app = Router::new()
        .route("/", get(|| async { Json(json!({"message": "hello from rust cookbook sample"})) }))
        .route("/health", get(|| async { Json(json!({"status": "ok"})) }));

    let port: u16 = std::env::var("PORT").ok().and_then(|s| s.parse().ok()).unwrap_or(8080);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    println!("listening on {addr}");

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .unwrap();
}

async fn shutdown_signal() {
    let ctrl_c = async { signal::ctrl_c().await.unwrap(); };
    let term = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .unwrap()
            .recv()
            .await;
    };
    tokio::select! { _ = ctrl_c => {}, _ = term => {} }
    println!("shutting down");
}
