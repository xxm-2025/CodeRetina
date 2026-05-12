# Claude Code Vision Evaluation Report

**Timestamp:** 2026-05-12T15:56:51

## Summary

- Total tasks: 5
- Successful: 5
- Failed: 0
- Success rate: 100.0%
- Avg steps: 6.2
- Avg duration: 0ms
- Avg cost: $0.0380

## Detailed Results

### ✅ dashboard
- Steps: 5
- Duration: 0ms
- Cost: $0.0500

### ✅ settings
- Steps: 5
- Duration: 0ms
- Cost: $0.0500

### ✅ login_page
- Steps: 5
- Duration: 0ms
- Cost: $0.0500

### ✅ osworld_calculator
- Steps: 8
- Duration: 0ms
- Cost: $0.0200

### ✅ osworld_textedit
- Steps: 8
- Duration: 0ms
- Cost: $0.0200

## Ablation Studies

(Results placeholder - to be filled in Sprint 5)

### baseline
```json
{
  "config": {},
  "success_rate": 0.0,
  "avg_cost": 0.0,
  "avg_latency": 0.0
}
```

### tier1_only
```json
{
  "config": {
    "router_tier": "tier1"
  },
  "success_rate": 0.0,
  "avg_cost": 0.0,
  "avg_latency": 0.0
}
```

### tier3_only
```json
{
  "config": {
    "router_tier": "tier3"
  },
  "success_rate": 0.0,
  "avg_cost": 0.0,
  "avg_latency": 0.0
}
```

### no_image_diff
```json
{
  "config": {
    "use_image_diff": false
  },
  "success_rate": 0.0,
  "avg_cost": 0.0,
  "avg_latency": 0.0
}
```

### no_reflection
```json
{
  "config": {
    "use_reflection": false
  },
  "success_rate": 0.0,
  "avg_cost": 0.0,
  "avg_latency": 0.0
}
```

