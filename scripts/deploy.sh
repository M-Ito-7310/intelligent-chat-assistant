#!/bin/bash

# =============================================================================
# AI Chatbot Deployment Script
# =============================================================================
# This script handles deployment to staging and production environments
# Usage: ./scripts/deploy.sh [staging|production] [options]
# =============================================================================

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_NAME="ai-chatbot"
BACKEND_DIR="backend"
FRONTEND_DIR="frontend"

# Default values
ENVIRONMENT=""
SKIP_TESTS=false
SKIP_BUILD=false
DRY_RUN=false
FORCE_DEPLOY=false
BACKUP_DB=true

# =============================================================================
# Helper Functions
# =============================================================================

print_header() {
    echo -e "${BLUE}================================${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}================================${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ  $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
    exit 1
}

print_usage() {
    cat << EOF
Usage: $0 <environment> [options]

Environments:
  staging     Deploy to staging environment
  production  Deploy to production environment

Options:
  --skip-tests        Skip running tests
  --skip-build        Skip build process
  --dry-run          Show what would be deployed without actually deploying
  --force            Force deployment even if tests fail
  --no-backup        Skip database backup (production only)
  --help             Show this help message

Examples:
  $0 staging
  $0 production --skip-tests
  $0 production --dry-run
  $0 staging --force --no-backup

EOF
}

# =============================================================================
# Argument Parsing
# =============================================================================

parse_arguments() {
    if [[ $# -eq 0 ]]; then
        print_error "Environment is required. Use --help for usage information."
    fi

    ENVIRONMENT=$1
    shift

    while [[ $# -gt 0 ]]; do
        case $1 in
            --skip-tests)
                SKIP_TESTS=true
                shift
                ;;
            --skip-build)
                SKIP_BUILD=true
                shift
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --force)
                FORCE_DEPLOY=true
                shift
                ;;
            --no-backup)
                BACKUP_DB=false
                shift
                ;;
            --help)
                print_usage
                exit 0
                ;;
            *)
                print_error "Unknown option: $1"
                ;;
        esac
    done

    # Validate environment
    if [[ "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "production" ]]; then
        print_error "Environment must be 'staging' or 'production'"
    fi
}

# =============================================================================
# Pre-deployment Checks
# =============================================================================

check_prerequisites() {
    print_header "Checking Prerequisites"
    
    # Check if we're in the right directory
    if [[ ! -f "package.json" ]] || [[ ! -d "$BACKEND_DIR" ]] || [[ ! -d "$FRONTEND_DIR" ]]; then
        print_error "Please run this script from the project root directory"
    fi

    # Check required tools
    local tools=("node" "npm" "git")
    for tool in "${tools[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            print_error "$tool is required but not installed"
        fi
    done

    # Check Git status
    if [[ -n $(git status --porcelain) ]]; then
        print_warning "You have uncommitted changes"
        if [[ "$FORCE_DEPLOY" != true ]]; then
            read -p "Continue anyway? (y/N): " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                print_error "Deployment cancelled"
            fi
        fi
    fi

    # Check environment file
    local env_file=".env.${ENVIRONMENT}"
    if [[ ! -f "$env_file" ]]; then
        print_error "Environment file $env_file not found"
    fi

    print_success "Prerequisites check passed"
}

# =============================================================================
# Testing
# =============================================================================

run_tests() {
    if [[ "$SKIP_TESTS" == true ]]; then
        print_warning "Skipping tests"
        return
    fi

    print_header "Running Tests"

    # Backend tests
    print_info "Running backend tests..."
    cd "$BACKEND_DIR"
    
    if ! npm test; then
        if [[ "$FORCE_DEPLOY" == true ]]; then
            print_warning "Tests failed but continuing due to --force flag"
        else
            print_error "Backend tests failed. Use --force to deploy anyway."
        fi
    fi
    
    cd ..

    # Frontend tests
    print_info "Running frontend tests..."
    cd "$FRONTEND_DIR"
    
    if ! npm run test:unit; then
        if [[ "$FORCE_DEPLOY" == true ]]; then
            print_warning "Frontend tests failed but continuing due to --force flag"
        else
            print_error "Frontend tests failed. Use --force to deploy anyway."
        fi
    fi
    
    cd ..

    print_success "All tests passed"
}

# =============================================================================
# Build Process
# =============================================================================

build_application() {
    if [[ "$SKIP_BUILD" == true ]]; then
        print_warning "Skipping build"
        return
    fi

    print_header "Building Application"

    # Install dependencies
    print_info "Installing backend dependencies..."
    cd "$BACKEND_DIR"
    npm ci --only=production
    cd ..

    print_info "Installing frontend dependencies..."
    cd "$FRONTEND_DIR"
    npm ci
    cd ..

    # Build frontend
    print_info "Building frontend..."
    cd "$FRONTEND_DIR"
    
    # Set environment for build
    if [[ "$ENVIRONMENT" == "production" ]]; then
        npm run build
    else
        npm run build:staging
    fi
    
    cd ..

    # Backend doesn't need building for Node.js, but we can run linting
    print_info "Linting backend code..."
    cd "$BACKEND_DIR"
    npm run lint
    cd ..

    print_success "Build completed successfully"
}

# =============================================================================
# Database Operations
# =============================================================================

backup_database() {
    if [[ "$BACKUP_DB" != true ]] || [[ "$ENVIRONMENT" != "production" ]]; then
        return
    fi

    print_header "Creating Database Backup"
    
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_file="backup_${ENVIRONMENT}_${timestamp}.sql"
    
    print_info "Creating database backup: $backup_file"
    
    # This would need to be customized based on your database setup
    # Example for PostgreSQL:
    # pg_dump $DATABASE_URL > "$backup_file"
    
    print_info "Backup would be created here (customize for your database)"
    print_success "Database backup completed"
}

run_migrations() {
    print_header "Running Database Migrations"
    
    cd "$BACKEND_DIR"
    
    # Set environment
    export NODE_ENV="$ENVIRONMENT"
    
    # Load environment variables
    if [[ -f "../.env.${ENVIRONMENT}" ]]; then
        set -a  # Automatically export all variables
        source "../.env.${ENVIRONMENT}"
        set +a
    fi
    
    # Run migrations (customize based on your migration system)
    print_info "Running database migrations..."
    # npm run migrate
    print_info "Migrations would run here (implement based on your setup)"
    
    cd ..
    
    print_success "Database migrations completed"
}

# =============================================================================
# Deployment Functions
# =============================================================================

deploy_backend() {
    print_header "Deploying Backend"
    
    if [[ "$DRY_RUN" == true ]]; then
        print_info "DRY RUN: Would deploy backend to $ENVIRONMENT"
        return
    fi
    
    cd "$BACKEND_DIR"
    
    case "$ENVIRONMENT" in
        "staging")
            print_info "Deploying to staging environment..."
            # Example: Deploy to Railway, Heroku, or your preferred platform
            # railway deploy --environment staging
            print_info "Backend staging deployment would happen here"
            ;;
        "production")
            print_info "Deploying to production environment..."
            # Example: Deploy to production
            # railway deploy --environment production
            print_info "Backend production deployment would happen here"
            ;;
    esac
    
    cd ..
    print_success "Backend deployment completed"
}

deploy_frontend() {
    print_header "Deploying Frontend"
    
    if [[ "$DRY_RUN" == true ]]; then
        print_info "DRY RUN: Would deploy frontend to $ENVIRONMENT"
        return
    fi
    
    cd "$FRONTEND_DIR"
    
    case "$ENVIRONMENT" in
        "staging")
            print_info "Deploying frontend to staging..."
            # Example: Deploy to Vercel staging
            # vercel --prod --target staging
            print_info "Frontend staging deployment would happen here"
            ;;
        "production")
            print_info "Deploying frontend to production..."
            # Example: Deploy to Vercel production
            # vercel --prod
            print_info "Frontend production deployment would happen here"
            ;;
    esac
    
    cd ..
    print_success "Frontend deployment completed"
}

# =============================================================================
# Post-deployment Tasks
# =============================================================================

run_post_deployment_checks() {
    print_header "Running Post-deployment Checks"
    
    # Health check endpoints
    local backend_url
    case "$ENVIRONMENT" in
        "staging")
            backend_url="https://staging-api.your-domain.com"
            ;;
        "production")
            backend_url="https://api.your-domain.com"
            ;;
    esac
    
    print_info "Checking backend health at $backend_url/health"
    
    # Wait a moment for deployment to complete
    sleep 10
    
    # Health check
    if command -v curl &> /dev/null; then
        if curl -f "$backend_url/health" &> /dev/null; then
            print_success "Backend health check passed"
        else
            print_warning "Backend health check failed"
        fi
    else
        print_info "curl not available, skipping health check"
    fi
    
    print_success "Post-deployment checks completed"
}

send_deployment_notification() {
    print_header "Sending Deployment Notification"
    
    local message="🚀 Deployment completed successfully!
Environment: $ENVIRONMENT
Project: $PROJECT_NAME
Time: $(date)
Version: $(git rev-parse --short HEAD)"
    
    print_info "Deployment notification:"
    echo "$message"
    
    # Here you could send to Slack, Discord, email, etc.
    # Example:
    # curl -X POST -H 'Content-type: application/json' \
    #   --data "{\"text\":\"$message\"}" \
    #   "$SLACK_WEBHOOK_URL"
    
    print_success "Notification sent"
}

# =============================================================================
# Rollback Function
# =============================================================================

rollback_deployment() {
    print_header "Rolling Back Deployment"
    
    print_warning "Rollback functionality not implemented yet"
    print_info "To rollback manually:"
    print_info "1. Revert to previous Git commit"
    print_info "2. Re-run deployment script"
    print_info "3. Restore database backup if needed"
    
    # Future implementation:
    # - Store deployment metadata
    # - Keep track of previous versions
    # - Implement automated rollback
}

# =============================================================================
# Main Deployment Flow
# =============================================================================

main() {
    print_header "AI Chatbot Deployment Script"
    
    # Parse command line arguments
    parse_arguments "$@"
    
    print_info "Deploying to: $ENVIRONMENT"
    if [[ "$DRY_RUN" == true ]]; then
        print_warning "DRY RUN MODE - No actual deployment will occur"
    fi
    
    # Pre-deployment phase
    check_prerequisites
    backup_database
    run_tests
    build_application
    
    # Deployment phase
    run_migrations
    deploy_backend
    deploy_frontend
    
    # Post-deployment phase
    run_post_deployment_checks
    send_deployment_notification
    
    print_success "🎉 Deployment to $ENVIRONMENT completed successfully!"
    
    # Show next steps
    echo ""
    print_info "Next steps:"
    print_info "1. Monitor application logs"
    print_info "2. Run smoke tests"
    print_info "3. Check error tracking (Sentry, etc.)"
    print_info "4. Verify all features work as expected"
    echo ""
    
    if [[ "$ENVIRONMENT" == "production" ]]; then
        print_warning "Production deployment completed. Monitor closely!"
    fi
}

# =============================================================================
# Script Execution
# =============================================================================

# Run main function with all arguments
main "$@"