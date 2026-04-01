redis_cache: redis-server config/redis_cache.conf
redis_queue: redis-server config/redis_queue.conf
web: cd sites && gunicorn --bind 127.0.0.1:8000 --workers 2 --timeout 120 frappe.wsgi:application
schedule: bench schedule
worker: bench worker 1>> logs/worker.log 2>> logs/worker.error.log
