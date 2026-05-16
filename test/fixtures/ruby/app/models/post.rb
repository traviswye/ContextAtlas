class Post < ApplicationRecord
  include Sluggable

  belongs_to :user
  has_and_belongs_to_many :tags

  enum :status, { draft: 0, published: 1, archived: 2 }

  scope :published, -> { where(status: :published) }
  scope :by_user, ->(user) { where(user: user) }

  validates :title, presence: true

  before_validation :set_default_status, on: :create

  def excerpt(length = 100)
    return '' if body.blank?
    body[0, length]
  end

  private

  def set_default_status
    self.status ||= :draft
  end
end
