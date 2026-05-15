class User < ApplicationRecord
  PREMIUM_TIER_LIMIT = 1000

  has_many :posts, dependent: :destroy
  has_one :profile

  enum :role, { admin: 0, editor: 1, viewer: 2 }

  scope :active, -> { where(deactivated_at: nil) }
  scope :recent, -> { where('created_at > ?', 30.days.ago) }
  scope :by_role, ->(role) { where(role: role) }

  validates :email, presence: true, uniqueness: true
  validates :name, length: { minimum: 2 }

  before_save :normalize_email
  after_create :send_welcome_email

  def display_name
    name.presence || email.split('@').first
  end

  def self.find_by_email(email)
    find_by(email: email.downcase)
  end

  private

  def normalize_email
    self.email = email.downcase.strip if email.present?
  end

  def send_welcome_email
    # placeholder
  end
end
