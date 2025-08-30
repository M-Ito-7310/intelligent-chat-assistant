#!/bin/bash

# =============================================================================
# AI Chatbot Health Check Script
# =============================================================================
# This script performs comprehensive health checks for the application
# Usage: ./scripts/health-check.sh [environment] [--verbose] [--json]
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT=""
VERBOSE=false
JSON_OUTPUT=false
TIMEOUT=30

# URLs based on environment
declare -A BACKEND_URLS=(
    ["development"]="http://localhost:3000"
    ["staging"]="https://staging-api.your-domain.com"
    ["production"]="https://api.your-domain.com"
)

declare -A FRONTEND_URLS=(
    ["development"]="http://localhost:5173"
    ["staging"]="https://staging.your-domain.com"
    ["production"]="https://your-domain.com"
)

# Health check results
CHECKS=()
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0

# =============================================================================
# Helper Functions
# =============================================================================

print_info() {
    if [[ "$VERBOSE" == true ]] || [[ "$JSON_OUTPUT" == false ]]; then
        echo -e "${BLUE}ℹ  $1${NC}"
    fi
}

print_success() {
    if [[ "$JSON_OUTPUT" == false ]]; then
        echo -e "${GREEN}✅ $1${NC}"
    fi
}

print_warning() {
    if [[ "$JSON_OUTPUT" == false ]]; then
        echo -e "${YELLOW}⚠️  $1${NC}"
    fi
}

print_error() {
    if [[ "$JSON_OUTPUT" == false ]]; then
        echo -e "${RED}❌ $1${NC}"
    fi
}

add_check_result() {
    local name="$1"
    local status="$2"
    local message="$3"
    local details="$4"
    local response_time="$5"
    
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    
    if [[ "$status" == "PASS" ]]; then
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
        print_success "$name: $message"
    elif [[ "$status" == "WARN" ]]; then
        print_warning "$name: $message"
    else
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
        print_error "$name: $message"
    fi
    
    # Store result for JSON output
    CHECKS+=("{\"name\":\"$name\",\"status\":\"$status\",\"message\":\"$message\",\"details\":\"$details\",\"response_time\":\"$response_time\"}")
}

# =============================================================================
# HTTP Health Checks
# =============================================================================

check_http_endpoint() {
    local name="$1"
    local url="$2"
    local expected_status="$3"
    local timeout="${4:-$TIMEOUT}"
    
    print_info "Checking $name at $url"
    
    local start_time=$(date +%s%N)
    local response
    local status_code
    local response_time
    
    if response=$(curl -s -w "%{http_code}" --max-time "$timeout" "$url" 2>/dev/null); then
        status_code="${response: -3}"
        response_body="${response%???}"
        local end_time=$(date +%s%N)
        response_time=$(( (end_time - start_time) / 1000000 ))
        
        if [[ "$status_code" == "$expected_status" ]]; then
            add_check_result "$name" "PASS" "HTTP $status_code (${response_time}ms)" "$response_body" "$response_time"
        else
            add_check_result "$name" "FAIL" "HTTP $status_code (expected $expected_status)" "$response_body" "$response_time"
        fi
    else
        add_check_result "$name" "FAIL" "Connection failed or timeout" "curl error" "timeout"
    fi
}

check_backend_health() {
    local backend_url="${BACKEND_URLS[$ENVIRONMENT]}"
    
    if [[ -z "$backend_url" ]]; then
        add_check_result "Backend Health" "FAIL" "Unknown environment: $ENVIRONMENT" "" ""
        return
    fi
    
    # Basic health check
    check_http_endpoint "Backend Health" "$backend_url/health" "200"
    
    # API endpoints check
    check_http_endpoint "Auth Endpoint" "$backend_url/api/auth/health" "200"
    
    # Database connectivity (through API)
    check_http_endpoint "Database Check" "$backend_url/api/health/database" "200"
    
    # Redis connectivity (through API)
    check_http_endpoint "Redis Check" "$backend_url/api/health/redis" "200"
    
    # AI Service check (through API)
    check_http_endpoint "AI Service Check" "$backend_url/api/health/ai" "200"
}

check_frontend_health() {
    local frontend_url="${FRONTEND_URLS[$ENVIRONMENT]}"
    
    if [[ -z "$frontend_url" ]]; then
        add_check_result "Frontend Health" "FAIL" "Unknown environment: $ENVIRONMENT" "" ""
        return
    fi
    
    # Frontend accessibility
    check_http_endpoint "Frontend Health" "$frontend_url" "200"
    
    # Static assets
    check_http_endpoint "Frontend Assets" "$frontend_url/assets" "200"
}

# =============================================================================
# Database Health Checks
# =============================================================================

check_database_direct() {
    if [[ -z "$DATABASE_URL" ]]; then
        add_check_result "Database Direct" "SKIP" "DATABASE_URL not set" "" ""
        return
    fi
    
    print_info "Checking direct database connection"
    
    local start_time=$(date +%s%N)
    
    if command -v psql &> /dev/null; then
        if psql "$DATABASE_URL" -c "SELECT 1;" &> /dev/null; then
            local end_time=$(date +%s%N)
            local response_time=$(( (end_time - start_time) / 1000000 ))
            add_check_result "Database Direct" "PASS" "Connection successful (${response_time}ms)" "" "$response_time"
        else
            add_check_result "Database Direct" "FAIL" "Connection failed" "" ""
        fi
    else
        add_check_result "Database Direct" "SKIP" "psql not available" "" ""
    fi
}

# =============================================================================
# Redis Health Checks
# =============================================================================

check_redis_direct() {
    if [[ -z "$REDIS_HOST" ]]; then
        add_check_result "Redis Direct" "SKIP" "REDIS_HOST not set" "" ""
        return
    fi
    
    print_info "Checking direct Redis connection"
    
    local start_time=$(date +%s%N)
    
    if command -v redis-cli &> /dev/null; then
        local redis_port="${REDIS_PORT:-6379}"
        local redis_args="-h $REDIS_HOST -p $redis_port"
        
        if [[ -n "$REDIS_PASSWORD" ]]; then
            redis_args="$redis_args -a $REDIS_PASSWORD"
        fi
        
        if redis-cli $redis_args ping &> /dev/null; then
            local end_time=$(date +%s%N)
            local response_time=$(( (end_time - start_time) / 1000000 ))
            add_check_result "Redis Direct" "PASS" "PING successful (${response_time}ms)" "" "$response_time"
        else
            add_check_result "Redis Direct" "FAIL" "PING failed" "" ""
        fi
    else
        add_check_result "Redis Direct" "SKIP" "redis-cli not available" "" ""
    fi
}

# =============================================================================
# SSL/Certificate Checks
# =============================================================================

check_ssl_certificate() {
    local url="$1"
    local name="$2"
    
    if [[ ! "$url" =~ ^https:// ]]; then
        add_check_result "$name SSL" "SKIP" "Not HTTPS" "" ""
        return
    fi
    
    local hostname=$(echo "$url" | sed 's|https://||' | sed 's|/.*||')
    
    print_info "Checking SSL certificate for $hostname"
    
    if command -v openssl &> /dev/null; then
        local cert_info
        cert_info=$(echo | timeout 10 openssl s_client -servername "$hostname" -connect "$hostname:443" 2>/dev/null | openssl x509 -noout -dates 2>/dev/null)
        
        if [[ -n "$cert_info" ]]; then
            local expiry_date
            expiry_date=$(echo "$cert_info" | grep "notAfter" | cut -d= -f2)
            
            if [[ -n "$expiry_date" ]]; then
                local expiry_timestamp
                expiry_timestamp=$(date -d "$expiry_date" +%s 2>/dev/null || date -j -f "%b %d %H:%M:%S %Y %Z" "$expiry_date" +%s 2>/dev/null)
                local current_timestamp
                current_timestamp=$(date +%s)
                local days_until_expiry
                days_until_expiry=$(( (expiry_timestamp - current_timestamp) / 86400 ))
                
                if [[ $days_until_expiry -gt 30 ]]; then
                    add_check_result "$name SSL" "PASS" "Certificate valid ($days_until_expiry days remaining)" "$expiry_date" ""
                elif [[ $days_until_expiry -gt 7 ]]; then
                    add_check_result "$name SSL" "WARN" "Certificate expires soon ($days_until_expiry days)" "$expiry_date" ""
                else
                    add_check_result "$name SSL" "FAIL" "Certificate expires very soon ($days_until_expiry days)" "$expiry_date" ""
                fi
            else
                add_check_result "$name SSL" "FAIL" "Could not parse expiry date" "" ""
            fi
        else
            add_check_result "$name SSL" "FAIL" "Could not retrieve certificate" "" ""
        fi
    else
        add_check_result "$name SSL" "SKIP" "openssl not available" "" ""
    fi
}

# =============================================================================
# DNS Checks
# =============================================================================

check_dns_resolution() {
    local url="$1"
    local name="$2"
    
    local hostname=$(echo "$url" | sed 's|https\?://||' | sed 's|/.*||')
    
    print_info "Checking DNS resolution for $hostname"
    
    if command -v nslookup &> /dev/null; then
        local start_time=$(date +%s%N)
        if nslookup "$hostname" &> /dev/null; then
            local end_time=$(date +%s%N)
            local response_time=$(( (end_time - start_time) / 1000000 ))
            add_check_result "$name DNS" "PASS" "DNS resolution successful (${response_time}ms)" "" "$response_time"
        else
            add_check_result "$name DNS" "FAIL" "DNS resolution failed" "" ""
        fi
    elif command -v dig &> /dev/null; then
        local start_time=$(date +%s%N)
        if dig "$hostname" &> /dev/null; then
            local end_time=$(date +%s%N)
            local response_time=$(( (end_time - start_time) / 1000000 ))
            add_check_result "$name DNS" "PASS" "DNS resolution successful (${response_time}ms)" "" "$response_time"
        else
            add_check_result "$name DNS" "FAIL" "DNS resolution failed" "" ""
        fi
    else
        add_check_result "$name DNS" "SKIP" "DNS tools not available" "" ""
    fi
}

# =============================================================================
# Performance Checks
# =============================================================================

check_response_times() {
    local backend_url="${BACKEND_URLS[$ENVIRONMENT]}"
    local frontend_url="${FRONTEND_URLS[$ENVIRONMENT]}"
    
    # Backend performance
    if [[ -n "$backend_url" ]]; then
        print_info "Checking backend response time"
        local start_time=$(date +%s%N)
        if curl -s --max-time 10 "$backend_url/health" > /dev/null; then
            local end_time=$(date +%s%N)
            local response_time=$(( (end_time - start_time) / 1000000 ))
            
            if [[ $response_time -lt 1000 ]]; then
                add_check_result "Backend Performance" "PASS" "Response time: ${response_time}ms" "" "$response_time"
            elif [[ $response_time -lt 3000 ]]; then
                add_check_result "Backend Performance" "WARN" "Response time: ${response_time}ms (slow)" "" "$response_time"
            else
                add_check_result "Backend Performance" "FAIL" "Response time: ${response_time}ms (very slow)" "" "$response_time"
            fi
        fi
    fi
    
    # Frontend performance
    if [[ -n "$frontend_url" ]]; then
        print_info "Checking frontend response time"
        local start_time=$(date +%s%N)
        if curl -s --max-time 10 "$frontend_url" > /dev/null; then
            local end_time=$(date +%s%N)
            local response_time=$(( (end_time - start_time) / 1000000 ))
            
            if [[ $response_time -lt 2000 ]]; then
                add_check_result "Frontend Performance" "PASS" "Response time: ${response_time}ms" "" "$response_time"
            elif [[ $response_time -lt 5000 ]]; then
                add_check_result "Frontend Performance" "WARN" "Response time: ${response_time}ms (slow)" "" "$response_time"
            else
                add_check_result "Frontend Performance" "FAIL" "Response time: ${response_time}ms (very slow)" "" "$response_time"
            fi
        fi
    fi
}

# =============================================================================
# Security Checks
# =============================================================================

check_security_headers() {
    local url="$1"
    local name="$2"
    
    print_info "Checking security headers for $name"
    
    local headers
    headers=$(curl -s -I --max-time 10 "$url" 2>/dev/null)
    
    local security_score=0
    local security_details=""
    
    # Check for important security headers
    if echo "$headers" | grep -i "strict-transport-security" > /dev/null; then
        security_score=$((security_score + 1))
        security_details="${security_details}HSTS "
    fi
    
    if echo "$headers" | grep -i "x-content-type-options" > /dev/null; then
        security_score=$((security_score + 1))
        security_details="${security_details}Content-Type-Options "
    fi
    
    if echo "$headers" | grep -i "x-frame-options\|content-security-policy" > /dev/null; then
        security_score=$((security_score + 1))
        security_details="${security_details}Frame-Protection "
    fi
    
    if echo "$headers" | grep -i "x-xss-protection" > /dev/null; then
        security_score=$((security_score + 1))
        security_details="${security_details}XSS-Protection "
    fi
    
    if [[ $security_score -ge 3 ]]; then
        add_check_result "$name Security" "PASS" "Good security headers ($security_score/4)" "$security_details" ""
    elif [[ $security_score -ge 2 ]]; then
        add_check_result "$name Security" "WARN" "Some security headers missing ($security_score/4)" "$security_details" ""
    else
        add_check_result "$name Security" "FAIL" "Security headers missing ($security_score/4)" "$security_details" ""
    fi
}

# =============================================================================
# Main Health Check Functions
# =============================================================================

run_all_health_checks() {
    if [[ "$JSON_OUTPUT" == false ]]; then
        echo -e "${BLUE}================================${NC}"
        echo -e "${BLUE}  AI Chatbot Health Check${NC}"
        echo -e "${BLUE}  Environment: $ENVIRONMENT${NC}"
        echo -e "${BLUE}================================${NC}"
    fi
    
    # Load environment variables if file exists
    if [[ -f ".env.${ENVIRONMENT}" ]]; then
        set -a
        source ".env.${ENVIRONMENT}"
        set +a
    fi
    
    # HTTP Health Checks
    check_backend_health
    check_frontend_health
    
    # Direct service checks
    check_database_direct
    check_redis_direct
    
    # DNS and SSL checks
    local backend_url="${BACKEND_URLS[$ENVIRONMENT]}"
    local frontend_url="${FRONTEND_URLS[$ENVIRONMENT]}"
    
    if [[ -n "$backend_url" ]]; then
        check_dns_resolution "$backend_url" "Backend"
        check_ssl_certificate "$backend_url" "Backend"
        check_security_headers "$backend_url" "Backend"
    fi
    
    if [[ -n "$frontend_url" ]]; then
        check_dns_resolution "$frontend_url" "Frontend"
        check_ssl_certificate "$frontend_url" "Frontend"
        check_security_headers "$frontend_url" "Frontend"
    fi
    
    # Performance checks
    check_response_times
}

# =============================================================================
# Output Functions
# =============================================================================

output_results() {
    if [[ "$JSON_OUTPUT" == true ]]; then
        # JSON output
        local checks_json=$(IFS=','; echo "${CHECKS[*]}")
        cat << EOF
{
  "timestamp": "$(date -Iseconds)",
  "environment": "$ENVIRONMENT",
  "summary": {
    "total": $TOTAL_CHECKS,
    "passed": $PASSED_CHECKS,
    "failed": $FAILED_CHECKS,
    "warnings": $((TOTAL_CHECKS - PASSED_CHECKS - FAILED_CHECKS))
  },
  "checks": [$checks_json]
}
EOF
    else
        # Text output
        echo ""
        echo -e "${BLUE}================================${NC}"
        echo -e "${BLUE}  Health Check Summary${NC}"
        echo -e "${BLUE}================================${NC}"
        echo -e "Total Checks: $TOTAL_CHECKS"
        echo -e "${GREEN}Passed: $PASSED_CHECKS${NC}"
        echo -e "${RED}Failed: $FAILED_CHECKS${NC}"
        echo -e "${YELLOW}Warnings: $((TOTAL_CHECKS - PASSED_CHECKS - FAILED_CHECKS))${NC}"
        
        local success_rate
        if [[ $TOTAL_CHECKS -gt 0 ]]; then
            success_rate=$((PASSED_CHECKS * 100 / TOTAL_CHECKS))
            echo -e "Success Rate: ${success_rate}%"
        fi
        
        echo ""
        
        if [[ $FAILED_CHECKS -eq 0 ]]; then
            echo -e "${GREEN}🎉 All critical checks passed!${NC}"
            exit 0
        else
            echo -e "${RED}💥 Some checks failed. Please investigate.${NC}"
            exit 1
        fi
    fi
}

# =============================================================================
# Main Script
# =============================================================================

print_usage() {
    cat << EOF
Usage: $0 <environment> [options]

Environments:
  development  Check local development environment
  staging      Check staging environment
  production   Check production environment

Options:
  --verbose    Show detailed output
  --json       Output results in JSON format
  --timeout N  Set timeout for HTTP checks (default: 30s)
  --help       Show this help message

Examples:
  $0 production
  $0 staging --verbose
  $0 production --json --timeout 60

EOF
}

main() {
    # Parse arguments
    if [[ $# -eq 0 ]]; then
        echo "Environment is required. Use --help for usage information."
        exit 1
    fi
    
    ENVIRONMENT=$1
    shift
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --verbose)
                VERBOSE=true
                shift
                ;;
            --json)
                JSON_OUTPUT=true
                shift
                ;;
            --timeout)
                TIMEOUT=$2
                shift 2
                ;;
            --help)
                print_usage
                exit 0
                ;;
            *)
                echo "Unknown option: $1"
                exit 1
                ;;
        esac
    done
    
    # Validate environment
    if [[ "$ENVIRONMENT" != "development" && "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "production" ]]; then
        echo "Environment must be 'development', 'staging', or 'production'"
        exit 1
    fi
    
    # Run health checks
    run_all_health_checks
    
    # Output results
    output_results
}

# Run main function with all arguments
main "$@"